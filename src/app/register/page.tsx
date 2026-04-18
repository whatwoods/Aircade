import type { Metadata } from 'next';
import {
  AuthShell,
  RegisterForm,
  readFlashMessage,
  redirectIfAuthenticated,
} from '@/features/auth';

export const metadata: Metadata = {
  title: '注册',
  description: '注册 Aircade，创建账号后即可直接登录。',
};

type RegisterPageProps = {
  searchParams?: {
    error?: string | string[];
    notice?: string | string[];
    next?: string | string[];
  };
};

function readNextTarget(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  await redirectIfAuthenticated('/account');

  const message =
    readFlashMessage(searchParams?.error, 'error') ??
    readFlashMessage(searchParams?.notice, 'notice');

  return (
    <AuthShell
      title="创建你的账号"
      subtitle="现在直接注册就能进站。注册成功后会自动登录，后面提交作品就不用再绕一次。"
      sideTitle="先把身份打稳"
      sideBody="这一步只做最核心的校验：用户名合规、邮箱格式正确、密码足够长。真正的作品提交、审核、后台管理，会在这套身份基础上继续叠。"
      sideLinks={[
        { href: '/login', label: '已经有账号，去登录' },
        { href: '/', label: '先回首页看看' },
      ]}
      message={message}
    >
      <RegisterForm redirectTo={readNextTarget(searchParams?.next)} />
    </AuthShell>
  );
}
