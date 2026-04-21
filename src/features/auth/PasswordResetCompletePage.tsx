import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LoadingSurface } from '@components/ui';
import { resolvePostLoginPath, resolveRoleLandingPath, useAuthSession } from './authSession';

export function PasswordResetCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completePasswordReset, session, status } = useAuthSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  if (status === 'loading') {
    return <LoadingSurface label="Loading Session..." />;
  }

  if (session) {
    return <Navigate to={resolveRoleLandingPath(session.user.role)} replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError('Password reset token is missing.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const session = await completePasswordReset(token, password);
      navigate(resolvePostLoginPath(session.user.role), { replace: true });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Password reset failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Set New Password</h1>
          <p className="mt-2 text-sm text-slate-600">
            Complete the one-time reset flow and sign back in.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              placeholder="Create a new password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 shadow-sm outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-amber-700 hover:text-amber-800">
            Return to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
