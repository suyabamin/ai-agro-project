/**
 * AgroAI — Authentication Context
 * Provides Firebase Auth state to the entire application.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { updateProfile, sendPasswordResetEmail as firebaseSendPasswordReset } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { authService, auth, db, isFirebaseConfigured } from '../services/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: 'owner' | 'farmer';
  averageRating?: number;
  totalRatings?: number;
}

export interface AuthContextValue {
  user: User | null;
  userProfile: UserProfile | null;
  userRole: 'owner' | 'farmer';
  loading: boolean;
  isAuthenticated: boolean;
  isFirebaseReady: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string, role?: 'owner' | 'farmer') => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
}

// ─── Error Code Mapping ────────────────────────────────────────────────────────

function mapFirebaseErrorKey(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'errors.emailAlreadyRegistered';
    case 'auth/invalid-email':
      return 'validation.emailInvalid';
    case 'auth/weak-password':
      return 'validation.passwordLength';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'errors.invalidCredentials';
    case 'auth/user-not-found':
      return 'errors.accountNotFound';
    case 'auth/too-many-requests':
      return 'errors.tooManyAttempts';
    case 'auth/network-request-failed':
      return 'errors.network';
    case 'auth/user-disabled':
      return 'errors.accountDisabled';
    case 'auth/operation-not-allowed':
      return 'errors.emailPasswordDisabled';
    default:
      return 'errors.unexpected';
  }
}

function extractFirebaseErrorKey(error: any): string {
  // Firebase errors have a `code` property like "auth/email-already-in-use"
  if (error?.code) return mapFirebaseErrorKey(error.code);
  // Fallback: parse from message string
  const match = String(error?.message || '').match(/\(([^)]+)\)/);
  if (match) return mapFirebaseErrorKey(match[1]);
  return mapFirebaseErrorKey('');
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const isFirebaseReady = isFirebaseConfigured();

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = authService.onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        let fetchedRole: 'owner' | 'farmer' = 'owner';
        let fetchedName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';

        if (db) {
          try {
            const docRef = doc(db, 'users', firebaseUser.uid);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const data = snap.data();
              if (data.role === 'farmer' || data.role === 'owner') {
                fetchedRole = data.role;
              }
              if (data.fullName) {
                fetchedName = data.fullName;
              }
            }
          } catch {
            // Fallback to defaults
          }
        }

        setUserProfile({
          uid: firebaseUser.uid,
          fullName: fetchedName,
          email: firebaseUser.email || '',
          role: fetchedRole,
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    if (!isFirebaseReady) {
      setLoading(false);
    }

    return unsubscribe;
  }, [isFirebaseReady]);

  // ─── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    // Demo Mode shortcut
    if (email.toLowerCase() === 'demo@agroai.com' || email.toLowerCase() === 'demo' || password === 'demo123') {
      const demoUser = {
        uid: 'owner_demo',
        email: 'demo@agroai.com',
        displayName: 'Demo Farm Owner',
      } as User;
      setUser(demoUser);
      setUserProfile({
        uid: 'owner_demo',
        fullName: 'Demo Farm Owner',
        email: 'demo@agroai.com',
        role: 'owner',
      });
      return { success: true };
    }

    if (!isFirebaseReady) {
      const fallbackUser = {
        uid: 'owner_demo',
        email: email,
        displayName: email.split('@')[0] || 'AgroAI User',
      } as User;
      setUser(fallbackUser);
      setUserProfile({
        uid: 'owner_demo',
        fullName: email.split('@')[0] || 'AgroAI User',
        email: email,
        role: 'owner',
      });
      return { success: true };
    }

    try {
      const result = await authService.loginUser(email, password);
      if (!result.success) {
        return { success: false, error: extractFirebaseErrorKey({ message: result.error }) };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: extractFirebaseErrorKey(err) };
    }
  }, [isFirebaseReady]);

  // ─── register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (fullName: string, email: string, password: string, role: 'owner' | 'farmer' = 'owner') => {
    if (!isFirebaseReady) {
      const newUser = {
        uid: 'demo-' + Date.now(),
        email,
        displayName: fullName,
      } as User;
      setUser(newUser);
      setUserProfile({
        uid: newUser.uid,
        fullName,
        email,
        role,
      });
      return { success: true };
    }
    try {
      const result = await authService.registerUser(email, password);
      if (!result.success || !result.user) {
        return { success: false, error: extractFirebaseErrorKey({ message: result.error }) };
      }

      const { user: newUser } = result;

      // Update Firebase Auth displayName
      if (auth && newUser) {
        try {
          await updateProfile(newUser, { displayName: fullName });
        } catch {
          // Non-critical — profile update failed silently
        }
      }

      // Create Firestore user profile (do NOT store password)
      if (db) {
        try {
          await setDoc(doc(db, 'users', newUser.uid), {
            uid: newUser.uid,
            fullName,
            email,
            role,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-critical for auth flow — Firestore write failed silently
        }
      }

      setUserProfile({
        uid: newUser.uid,
        fullName,
        email,
        role,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: extractFirebaseErrorKey(err) };
    }
  }, [isFirebaseReady]);

  // ─── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await authService.logoutUser();
    setUser(null);
    setUserProfile(null);
  }, []);

  // ─── sendPasswordReset ───────────────────────────────────────────────────────
  const sendPasswordReset = useCallback(async (email: string) => {
    if (!isFirebaseReady || !auth) {
      return { success: false, error: 'auth.firebaseNotConfigured' };
    }
    try {
      await firebaseSendPasswordReset(auth, email);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: extractFirebaseErrorKey(err) };
    }
  }, [isFirebaseReady]);

  const value: AuthContextValue = {
    user,
    userProfile,
    userRole: userProfile?.role || 'owner',
    loading,
    isAuthenticated: Boolean(user),
    isFirebaseReady,
    login,
    register,
    logout,
    sendPasswordReset,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
