'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const emailSchema = z.object({ email: z.string().trim().email('Invalid email') });
const resetSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, '6-digit code'),
  new_password: z.string().min(8, 'At least 8 characters').max(128),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string | null>(null);
  return email ? <ResetStep email={email} /> : <EmailStep onSent={setEmail} />;
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
  });
  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      const r = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', json: { email } });
      toast.info(r.message);
      onSent(email);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Reset password</h1>
      <p className="text-sm text-t3">We&apos;ll email you a 6-digit code.</p>
      <Input label="Email" type="email" autoComplete="email" autoFocus {...register('email')} error={errors.email?.message} />
      {errors.root && <p role="alert" className="text-sm text-accent">{errors.root.message}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">Send code</Button>
      <p className="text-center text-xs"><Link href="/login" className="text-t3 hover:text-t1">Back to sign in</Link></p>
    </form>
  );
}

function ResetStep({ email }: { email: string }) {
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
  });
  const onSubmit = handleSubmit(async (v) => {
    try {
      await api('/auth/reset-password', { method: 'POST', json: { email, ...v } });
      toast.success('Password updated. Sign in with your new password.');
      router.replace('/login');
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">Enter code</h1>
      <p className="text-sm text-t3">Sent to {email} if it&apos;s registered. Valid for 10 minutes.</p>
      <Input label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus {...register('otp')} error={errors.otp?.message} />
      <Input label="New password" type="password" autoComplete="new-password" {...register('new_password')} error={errors.new_password?.message} />
      {errors.root && <p role="alert" className="text-sm text-accent">{errors.root.message}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">Set new password</Button>
    </form>
  );
}
