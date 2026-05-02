import { expect, test } from '@playwright/test';
import {
  ADMIN_STORAGE_STATE_PATH,
  readBackendE2EManifest,
} from './support/backendE2e';
import {
  completePreCheckIfPresent,
  deterministicWcode,
  openStudentSessionWithRetry,
  startLobbyIfPresent,
  studentCheckIn,
  stubScreenDetails,
} from './support/studentUi';

test.describe('Student LRW workflow', () => {
  test.describe.configure({ timeout: 120_000 });

  test('registration page enforces required check-in fields', async ({ page }) => {
    const manifest = readBackendE2EManifest();

    await page.goto(`/student/${manifest.studentSelfPaced.scheduleId}`);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByText('Wcode is required and must be in format W followed by 6 digits'),
    ).toBeVisible();
    await expect(
      page.getByText('Email is required and must be valid'),
    ).toBeVisible();
    await expect(page.getByText('Name is required')).toBeVisible();
  });

  test('runtime-backed: student checks in and submits through Finish', async ({ browser }, testInfo) => {
    const manifest = readBackendE2EManifest();

    const wcode = deterministicWcode(`${testInfo.project.name}:${testInfo.title}`);
    const studentName = `E2E Candidate ${wcode}`;

    const context = await browser.newContext();
    await stubScreenDetails(context);
    const page = await context.newPage();

    await studentCheckIn(page, manifest.student.scheduleId, {
      wcode,
      email: `e2e+${wcode.toLowerCase()}@example.com`,
      fullName: studentName,
    });
    await openStudentSessionWithRetry(page, manifest.student.scheduleId, wcode);
    await completePreCheckIfPresent(page);
    await startLobbyIfPresent(page);
    await openStudentSessionWithRetry(page, manifest.student.scheduleId, wcode);
    await expect(page.getByLabel('Answer for question 1')).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Answer for question 1').fill(manifest.student.expectedAnswer);
    await expect
      .poll(async () => {
        const banner = page.getByRole('banner');
        const saved = banner.getByText('Saved');
        if (await saved.isVisible().catch(() => false)) {
          return 'saved';
        }
        const saving = banner.getByText(/Saving|Syncing/i);
        if (await saving.isVisible().catch(() => false)) {
          return 'saving';
        }
        return 'unknown';
      }, { timeout: 20_000 })
      .toBe('saved');
    const finishButton = page.getByRole('button', { name: 'Finish' });
    const submitResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes(`/api/v1/student/sessions/${manifest.student.scheduleId}/submit`),
        { timeout: 60_000 },
      )
      .catch(() => null);

    await finishButton.scrollIntoViewIfNeeded();
    await finishButton.click().catch(async () => {
      await finishButton.click({ force: true });
    });

    const submitResponse = await submitResponsePromise;
    if (!submitResponse) {
      throw new Error('Did not observe a submit network request.');
    }
    expect(submitResponse.ok()).toBeTruthy();

    const completionHeading = page.getByRole('heading', { name: /Examination Complete!/i });
    await expect
      .poll(async () => {
        if (await completionHeading.isVisible().catch(() => false)) {
          return 'complete';
        }
        const stillInExam = await finishButton.isVisible().catch(() => false);
        return stillInExam ? 'exam' : 'pending';
      }, { timeout: 45_000 })
      .toBe('complete');

    const adminContext = await browser.newContext({
      storageState: process.env.ADMIN_STORAGE_STATE || ADMIN_STORAGE_STATE_PATH,
    });
    const adminPage = await adminContext.newPage();

    await adminPage.goto('/admin/grading');
    await expect(adminPage.getByRole('heading', { name: /Grading Queue/i })).toBeVisible();

    await expect
      .poll(async () => {
        const sessionsResponse = await adminPage.request.get('/api/v1/grading/sessions');
        if (!sessionsResponse.ok()) return false;

        const sessions = (await sessionsResponse.json()) as Array<{ id: string; scheduleId?: string }>;
        const session = sessions.find((entry) => entry.scheduleId === manifest.student.scheduleId);
        if (!session?.id) return false;

        const detailResponse = await adminPage.request.get(
          `/api/v1/grading/sessions/${session.id}?page=1&pageSize=200`,
        );
        if (!detailResponse.ok()) return false;

        const detailPayload = (await detailResponse.json()) as {
          submissions?: Array<{ id: string; studentName?: string }>;
        };
        const submission = detailPayload.submissions?.find(
          (entry) => entry.studentName === studentName,
        );
        if (!submission?.id) return false;

        const sectionResponse = await adminPage.request.get(
          `/api/v1/grading/submissions/${submission.id}/sections`,
        );
        if (!sectionResponse.ok()) return false;

        const sections = (await sectionResponse.json()) as Array<{
          section: string;
          autoGradingResults?: {
            percentage?: number;
            questionResults?: Array<{ isCorrect?: boolean }>;
          };
        }>;

        const objectiveSections = sections.filter(
          (section) => section.section === 'reading' || section.section === 'listening',
        );
        if (objectiveSections.length === 0) return false;

        return objectiveSections.some((section) => {
          const autoResult = section.autoGradingResults;
          if (!autoResult || autoResult.percentage !== 100) return false;
          if (!Array.isArray(autoResult.questionResults) || autoResult.questionResults.length === 0) {
            return false;
          }
          return autoResult.questionResults.every((question) => question.isCorrect === true);
        });
      }, { timeout: 60_000 })
      .toBe(true);

    await adminContext.close();
    await context.close();
  });
});
