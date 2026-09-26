'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// Mirrors SignupIn in the backend's app/schemas.py.
const schema = z.object({
  login_id: z.string().trim().min(3, 'At least 3 characters').max(50)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Letters, digits, _ . - only'),
  email: z.string().trim().email('Invalid email').max(255),
  password: z.string().min(8, 'At least 8 characters').max(128),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export default function SignupPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async ({ login_id, email, password }) => {
    try {
      await api('/auth/signup', { method: 'POST', json: { login_id, email, password } });
      await login(login_id, password); // signup doesn't set cookies; log straight in
      router.replace('/dashboard');
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Create account</h1>
      <Input label="Login ID" autoComplete="username" autoFocus {...register('login_id')} error={errors.login_id?.message} />
      <Input label="Email" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
      <Input label="Password" type="password" autoComplete="new-password" {...register('password')} error={errors.password?.message} />
      <Input label="Confirm password" type="password" autoComplete="new-password" {...register('confirm')} error={errors.confirm?.message} />
      {errors.root && <p role="alert" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errors.root.message}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">Create account</Button>
      <p className="text-center text-xs text-t3">
        New accounts are Staff. <Link href="/login" className="text-t2 hover:text-t1">Sign in instead</Link>
      </p>
    </form>
  );
}
