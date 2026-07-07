import { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-sm">
        <h2 className="text-2xl font-bold mb-2">Slidesmith</h2>
        <p className="text-gray-500 text-sm mb-6">Sign in with your Superwave account</p>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="flex items-center gap-3 mx-auto px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" />
          <span className="text-sm font-medium">{loading ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>
        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
}
