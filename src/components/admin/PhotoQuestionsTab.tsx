'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminPhotoQuestion } from '@/lib/types';
import { SCORING } from '@/lib/scoring';
import { errorText } from './admin-api';
import {
  createQuestion,
  deleteQuestion,
  listAdminQuestions,
  updateQuestion,
  uploadImage,
  type QuestionPayload,
} from './endpoints';

const OPTION_COUNT = 4;
const LETTERS = ['А', 'Б', 'В', 'Г'];

/**
 * Наполнение квиза «Угадай по фото». Это единственный способ завести вопросы,
 * поэтому форма рассчитана на нетехнического оператора: загрузил картинку,
 * написал вопрос, отметил правильный вариант.
 */
export function PhotoQuestionsTab() {
  const [items, setItems] = useState<AdminPhotoQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminPhotoQuestion | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listAdminQuestions());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <QuestionForm
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Фото-вопросы
        </h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="min-h-tap rounded-btn bg-teboil-red px-4 font-display text-kiosk-sm font-black uppercase text-white"
        >
          + Добавить
        </button>
      </div>

      {error && (
        <p className="text-kiosk-sm font-bold text-teboil-red" role="alert">
          {error}
        </p>
      )}

      {loading && items.length === 0 && (
        <p className="py-6 text-center text-kiosk-sm text-teboil-muted">Загрузка…</p>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="py-8 text-center text-kiosk-sm text-teboil-muted">
          Вопросов пока нет. Пока их не добавить, участники увидят на стенде
          заглушку вместо фото-квиза.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((q) => (
          <li
            key={q.id}
            className="overflow-hidden rounded-card border-2 border-teboil-line bg-white/5"
          >
            <div className="flex gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={q.imagePath}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-display text-kiosk-sm font-black text-teboil-black">
                  {q.question}
                </p>
                <p className="mt-1 text-kiosk-sm text-teboil-muted">
                  Ответ: {LETTERS[q.correctIndex] ?? '?'} · {q.points} баллов
                  {!q.active && ' · выключен'}
                </p>
              </div>
            </div>
            <div className="flex border-t border-teboil-line">
              <button
                type="button"
                onClick={() => setEditing(q)}
                className="min-h-tap flex-1 font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
              >
                Изменить
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateQuestion(q.id, { active: !q.active });
                    await load();
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
                className="min-h-tap flex-1 border-l border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-muted active:bg-white/10"
              >
                {q.active ? 'Выключить' : 'Включить'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------- Форма ---------------------------------- */

function QuestionForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminPhotoQuestion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [imagePath, setImagePath] = useState(initial?.imagePath ?? '');
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [options, setOptions] = useState<string[]>(() => {
    const base = initial?.options ?? [];
    return Array.from({ length: OPTION_COUNT }, (_, i) => base[i] ?? '');
  });
  const [correctIndex, setCorrectIndex] = useState(initial?.correctIndex ?? 0);
  const [points, setPoints] = useState(
    String(initial?.points ?? SCORING.photoQuiz.correct),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pointsNumber = Number(points.trim());
  const valid =
    imagePath !== '' &&
    question.trim() !== '' &&
    options.every((o) => o.trim() !== '') &&
    Number.isInteger(pointsNumber) &&
    pointsNumber > 0;

  async function pickFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadImage(file);
      setImagePath(result.path);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload: QuestionPayload = {
      imagePath,
      question: question.trim(),
      options: options.map((o) => o.trim()),
      correctIndex,
      points: pointsNumber,
      active: initial?.active ?? true,
    };
    try {
      if (initial) await updateQuestion(initial.id, payload);
      else await createQuestion(payload);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="min-h-tap font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
      >
        ← Назад
      </button>

      <div>
        <p className="mb-2 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Фотография
        </p>
        {imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagePath}
            alt=""
            className="mb-2 h-44 w-full rounded-card object-cover"
          />
        ) : (
          <div className="mb-2 flex h-44 w-full items-center justify-center rounded-card border-2 border-dashed border-teboil-line text-kiosk-sm text-teboil-muted">
            Фото не выбрано
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickFile(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="min-h-tap w-full rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10 disabled:opacity-40"
        >
          {uploading ? 'Загружаем…' : imagePath ? 'Заменить фото' : 'Загрузить фото'}
        </button>
      </div>

      <div>
        <label className="mb-2 block font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Вопрос
        </label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="Например: сколько километров в этом марафоне?"
          className="w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 py-3 text-kiosk-base text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-2 font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Варианты ответа — отметьте правильный
        </p>
        <div className="space-y-2">
          {options.map((value, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrectIndex(i)}
                aria-label={`Правильный ответ ${LETTERS[i]}`}
                aria-pressed={correctIndex === i}
                className={`min-h-tap w-14 shrink-0 rounded-btn border-2 font-display text-kiosk-base font-black transition-colors ${
                  correctIndex === i
                    ? 'border-teboil-red bg-teboil-red text-white'
                    : 'border-teboil-line text-teboil-muted active:bg-white/10'
                }`}
              >
                {LETTERS[i]}
              </button>
              <input
                value={value}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                placeholder={`Вариант ${LETTERS[i]}`}
                className="min-h-tap w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-kiosk-sm text-teboil-black placeholder:text-teboil-muted/60 focus:border-teboil-red focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-display text-kiosk-sm font-black uppercase tracking-wide text-teboil-muted">
          Баллы за правильный ответ
        </label>
        <input
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]*"
          className="min-h-tap-lg w-full rounded-btn border-2 border-teboil-line bg-teboil-ink px-4 text-kiosk-lg font-black text-teboil-black focus:border-teboil-red focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-kiosk-sm font-bold text-teboil-red" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!valid || busy}
        onClick={save}
        className="min-h-tap-xl w-full rounded-btn bg-teboil-red font-display text-kiosk-lg font-black uppercase tracking-tight text-white disabled:opacity-40"
      >
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>

      {initial &&
        (confirmDelete ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-tap flex-1 rounded-btn border-2 border-teboil-line font-display text-kiosk-sm font-black uppercase text-teboil-black active:bg-white/10"
            >
              Оставить
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteQuestion(initial.id);
                  onSaved();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
              className="min-h-tap flex-1 rounded-btn bg-teboil-red font-display text-kiosk-sm font-black uppercase text-white"
            >
              Удалить
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-tap w-full font-display text-kiosk-sm font-black uppercase text-teboil-muted active:text-teboil-red"
          >
            Удалить вопрос
          </button>
        ))}
    </div>
  );
}
