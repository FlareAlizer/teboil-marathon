'use client';

import { QuizButton, QuizScreen, RowPlate, ScreenTitle } from './quiz-ui';
import type { QuizData } from './game-api';
import type { WheelSector } from './SpinWheel';

/**
 * Ручной выбор темы — макет 49:332.
 *
 * Второй путь к вопросу помимо рулетки: участник сам берёт рубрику, если не
 * хочет полагаться на колесо. Список — ровно те же темы, что и на колесе:
 * только те, где на текущем уровне ещё остались вопросы. Из-за этого мёртвых
 * строк в списке не бывает, как и мёртвых секторов на колесе.
 *
 * Подпись «N вопросов» описывает размер рубрики целиком (по всем уровням) —
 * так же, как в макете. Число считается из данных `/api/quiz`, не зашито.
 */
export function ThemePickScreen({
  points,
  quiz,
  themes,
  onPick,
  onStations,
}: {
  points: number;
  quiz: QuizData;
  themes: WheelSector[];
  onPick: (theme: WheelSector) => void;
  onStations: () => void;
}) {
  const counts = countByTheme(quiz);

  return (
    <QuizScreen points={points}>
      <ScreenTitle title="Выбрать тему" />

      <ul className="space-y-3">
        {themes.map((theme, index) => (
          <li key={theme.id}>
            <RowPlate
              badge={index + 1}
              badgeTone={index % 2 === 0 ? 'pale' : 'pale-blue'}
              title={theme.label}
              note={questionsLabel(counts.get(theme.id) ?? 0)}
              onClick={() => onPick(theme)}
            />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex justify-center pt-10">
        <QuizButton tone="pale" onClick={onStations}>
          К станциям
        </QuizButton>
      </div>
    </QuizScreen>
  );
}

/** Сколько всего вопросов в каждой рубрике — по всем уровням квиза. */
function countByTheme(quiz: QuizData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const level of quiz.levels) {
    for (const question of level.questions) {
      counts.set(question.theme, (counts.get(question.theme) ?? 0) + 1);
    }
  }
  return counts;
}

/** «1 вопрос» / «3 вопроса» / «9 вопросов» — иначе подпись выглядит неряшливо. */
function questionsLabel(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} вопросов`;
  if (last === 1) return `${count} вопрос`;
  if (last >= 2 && last <= 4) return `${count} вопроса`;
  return `${count} вопросов`;
}
