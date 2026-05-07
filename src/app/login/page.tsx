import type { Metadata } from 'next';
import {
  AuthShell,
  LoginForm,
  readFlashMessage,
  redirectIfAuthenticated,
} from '@/features/auth';

export const metadata: Metadata = {
  title: '登录',
  description: '登录 Aircade，继续浏览、点赞、收藏和提交作品。',
};

type LoginPageProps = {
  searchParams?: {
    error?: string | string[];
    notice?: string | string[];
    next?: string | string[];
  };
};

function readNextTarget(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectIfAuthenticated('/account');

  const message =
    readFlashMessage(searchParams?.error, 'error') ??
    readFlashMessage(searchParams?.notice, 'notice');

  return (
    <AuthShell
      title="回来继续逛街机厅"
      subtitle="登录后你就能点赞、收藏、提交作品，也能在后续直接进入自己的用户中心。"
      sideTitle="群友作品，不该散落在聊天记录里"
      sideLinks={[
        { href: '/register', label: '还没账号，去注册' },
        { href: '/', label: '先回首页看看' },
      ]}
      message={message}
    >
      <LoginForm redirectTo={readNextTarget(searchParams?.next)} />
    </AuthShell>
  );
}
