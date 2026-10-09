import { QuizResetScreen } from '@/components/admin/QuizResetScreen';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Teboil — сброс рейтинга квизов',
};

export default function ResetQuizPage() {
  return <QuizResetScreen />;
}
