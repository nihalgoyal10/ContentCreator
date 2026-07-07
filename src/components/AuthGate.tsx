import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { logOut } from '../lib/firebase';
import { isAllowed } from '../lib/access';
import { LoginScreen } from './LoginScreen';

// Root auth gate — same pattern as superwave-admin: while Firebase resolves the
// restored session show a loader, then either the login screen or the app.
// After sign-in we also check the email against the allowlist (lib/access.ts).
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (!isAllowed(user.email)) return <AccessDenied email={user.email} />;

  return <>{children}</>;
}

function AccessDenied({ email }: { email: string | null }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-sm">
        <h2 className="text-2xl font-bold mb-2">Access denied</h2>
        <p className="text-gray-500 text-sm mb-6">
          {email ? <><span className="font-medium">{email}</span> isn't</> : "This account isn't"} authorized to use
          Slidesmith. Ask an admin to add your email.
        </p>
        <button
          onClick={() => logOut()}
          className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
