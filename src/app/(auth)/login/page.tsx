'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const schema = z.object({
  login_id: z.string().trim().min(1, 'Required').max(50),
  password: z.string().min(1, 'Required').max(128),
});

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  // Only same-app paths, never an absolute URL (open redirect).
  const dest = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  useEffect(() => { if (user) router.replace(dest); }, [user, dest, router]);

  const onSubmit = handleSubmit(async ({ login_id, password }) => {
    try {
      await login(login_id, password);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Sign in</h1>
      <Input label="Login ID" autoComplete="username" autoFocus {...register('login_id')} error={errors.login_id?.message} />
      <Input label="Password" type="password" autoComplete="current-password" {...register('password')} error={errors.password?.message} />
      {errors.root && <p role="alert" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errors.root.message}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">Sign in</Button>
      <div className="flex justify-between text-xs text-t3">
        <Link href="/forgot-password" className="hover:text-t1">Forgot password?</Link>
        <Link href="/signup" className="hover:text-t1">Create account</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
