import React from 'react';
import { SingleMCQBlock as SingleMCQBlockType, MCQOption, SingleMCQQuestion } from '../../types';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { createId } from '../../utils/idUtils';
import { handleBoldHotkey } from '../../utils/boldMarkdown';
import { InsertedImagesEditor } from './InsertedImagesEditor';

interface SingleMCQBlockProps {
  block: SingleMCQBlockType;
  startNum: number;
  endNum: number;
  updateBlock: (block: SingleMCQBlockType) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, direction: 'up' | 'down') => void;
  errors?: Array<{ field: string; message: string }>;
}

const createDefaultSingleMcqQuestion = (id = createId('q')): SingleMCQQuestion => ({
  id,
  stem: '',
  options: [
    { id: createId('opt'), text: 'Option A', isCorrect: true },
    { id: createId('opt'), text: 'Option B', isCorrect: false },
    { id: createId('opt'), text: 'Option C', isCorrect: false },
  ],
});

export function SingleMCQBlock({
  block,
  startNum,
  endNum,
  updateBlock,
  deleteBlock,
  moveBlock,
  errors = [],
}: SingleMCQBlockProps) {
  const questions =
    Array.isArray(block.questions) && block.questions.length > 0
      ? block.questions
      : [
          {
            id: block.id,
            stem: block.stem || '',
            options: block.options,
          },
        ];

  const syncBlockQuestions = (nextQuestions: SingleMCQQuestion[]) => {
    const firstQuestion = nextQuestions[0];
    if (!firstQuestion) {
      return;
    }

    updateBlock({
      ...block,
      stem: firstQuestion.stem,
      options: firstQuestion.options,
      questions: nextQuestions,
    });
  };

  const updateQuestionStem = (questionId: string, stem: string) => {
    const nextQuestions = questions.map((question) => (question.id === questionId ? { ...question, stem } : question));
    syncBlockQuestions(nextQuestions);
  };

  const updateOption = (questionId: string, optionId: string, updates: Partial<MCQOption>) => {
    const nextQuestions = questions.map((question) => {
      if (question.id !== questionId) {
        return question;
      }
      return {
        ...question,
        options: question.options.map((option) => (option.id === optionId ? { ...option, ...updates } : option)),
      };
    });
    syncBlockQuestions(nextQuestions);
  };

  const addQuestion = () => {
    syncBlockQuestions([...questions, createDefaultSingleMcqQuestion()]);
  };

  const removeQuestion = (questionId: string) => {
    if (questions.length <= 1) {
      return;
    }
    syncBlockQuestions(questions.filter((question) => question.id !== questionId));
  };

  const addOption = (questionId: string) => {
    const nextQuestions = questions.map((question) => {
      if (question.id !== questionId) {
        return question;
      }
      return {
        ...question,
        options: [...question.options, { id: createId('opt'), text: '', isCorrect: false }],
      };
    });
    syncBlockQuestions(nextQuestions);
  };

  const removeOption = (questionId: string, optionId: string) => {
    const nextQuestions = questions.map((question) => {
      if (question.id !== questionId || question.options.length <= 2) {
        return question;
      }
      return {
        ...question,
        options: question.options.filter((option) => option.id !== optionId),
      };
    });
    syncBlockQuestions(nextQuestions);
  };

  const setCorrectAnswer = (questionId: string, optionId: string) => {
    const nextQuestions = questions.map((question) => {
      if (question.id !== questionId) {
        return question;
      }
      return {
        ...question,
        options: question.options.map((option) => ({
          ...option,
          isCorrect: option.id === optionId,
        })),
      };
    });
    syncBlockQuestions(nextQuestions);
  };

  const getErrorMessage = (fieldCandidates: string[]): string | null => {
    for (const field of fieldCandidates) {
      const found = errors.find((error) => error.field === field);
      if (found) {
        return found.message;
      }
    }

    return null;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="font-bold text-gray-900">{startNum === endNum ? `Q${startNum}` : `Q${startNum}-${endNum}`}</span>
          <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 rounded">
            Single Choice MCQ
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveBlock(block.id, 'up')}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            title="Move up"
          >
            <ArrowUp size={16} />
          </button>
          <button
            onClick={() => moveBlock(block.id, 'down')}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            title="Move down"
          >
            <ArrowDown size={16} />
          </button>
          <button
            onClick={() => deleteBlock(block.id)}
            className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
            title="Delete block"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-600">
        Use Add Question above; Add Option is per question.
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Instruction
        </label>
        <textarea
          value={block.instruction}
          onChange={(event) => updateBlock({ ...block, instruction: event.target.value })}
          onKeyDown={(event) =>
            handleBoldHotkey(event, (nextValue) => updateBlock({ ...block, instruction: nextValue }))
          }
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          placeholder="Enter instruction for this question set..."
        />
      </div>
      <InsertedImagesEditor
        images={block.insertedImages}
        onChange={(nextImages) => updateBlock({ ...block, insertedImages: nextImages })}
        errors={errors}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Questions ({questions.length})
          </label>
          <button
            onClick={addQuestion}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus size={14} /> Add Question
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((question, questionIndex) => {
            const questionStemError = getErrorMessage([
              `questions[${questionIndex}].stem`,
              questionIndex === 0 ? 'stem' : '',
            ].filter(Boolean));
            const optionsError = getErrorMessage([
              `questions[${questionIndex}].options`,
              questionIndex === 0 ? 'options' : '',
            ].filter(Boolean));
            const hasCorrectOption = question.options.some((option) => option.isCorrect);

            return (
              <div key={question.id} className="border rounded-md p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    {startNum + questionIndex}.
                  </span>
                  {questions.length > 1 ? (
                    <button
                      onClick={() => removeQuestion(question.id)}
                      className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600"
                      title="Remove question"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Question Stem
                  </label>
                  <textarea
                    value={question.stem}
                    onChange={(event) => updateQuestionStem(question.id, event.target.value)}
                    onKeyDown={(event) =>
                      handleBoldHotkey(event, (nextValue) => updateQuestionStem(question.id, nextValue))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Enter the question stem..."
                  />
                  {questionStemError ? <p className="text-xs text-red-600 mt-1">{questionStemError}</p> : null}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-600">
                      Options (Select one correct answer)
                    </label>
                    <button
                      onClick={() => addOption(question.id)}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus size={14} /> Add Option
                    </button>
                  </div>

                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <div key={option.id} className="flex items-start gap-3 p-3 border rounded-md">
                        <button
                          onClick={() => setCorrectAnswer(question.id, option.id)}
                          className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            option.isCorrect ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          }`}
                        >
                          {option.isCorrect ? <div className="w-2 h-2 bg-white rounded-full" /> : null}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-700">
                              {String.fromCharCode(65 + optionIndex)}.
                            </span>
                            <input
                              type="text"
                              value={option.text}
                              onChange={(event) => updateOption(question.id, option.id, { text: event.target.value })}
                              onKeyDown={(event) =>
                                handleBoldHotkey(event, (nextValue) =>
                                  updateOption(question.id, option.id, { text: nextValue }),
                                )
                              }
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Option text..."
                            />
                          </div>
                        </div>
                        {question.options.length > 2 ? (
                          <button
                            onClick={() => removeOption(question.id, option.id)}
                            className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 mt-1"
                            title="Remove option"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {!hasCorrectOption ? (
                    <p className="text-xs text-amber-600 mt-2">Please select one correct answer</p>
                  ) : null}
                  {optionsError ? <p className="text-xs text-red-600 mt-1">{optionsError}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
