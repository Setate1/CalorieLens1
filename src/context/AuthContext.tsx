import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatAuthErrorMessage = (error: any): string => {
    const code = error?.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "البريد الإلكتروني غير صالح. يرجى التأكد من كتابته بشكل صحيح.";
      case "auth/user-disabled":
        return "هذا الحساب تم تعطيله. يرجى التواصل مع الدعم.";
      case "auth/user-not-found":
        return "لا يوجد حساب مسجل بهذا البريد الإلكتروني. يمكنك إنشاء حساب جديد.";
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "كلمة المرور أو البريد الإلكتروني غير صحيح. يرجى إعادة المحاولة.";
      case "auth/email-already-in-use":
        return "هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.";
      case "auth/weak-password":
        return "كلمة المرور ضعيفة جداً. يجب أن تتكون من 6 أحرف على الأقل.";
      case "auth/too-many-requests":
        return "محاولات كثيرة غير ناجحة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.";
      case "auth/network-request-failed":
        return "تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.";
      default:
        return error?.message || "حدث خطأ أثناء المصادقة. يرجى المحاولة مرة أخرى.";
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      setAuthError(null);
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signUp = async (email: string, pass: string) => {
    try {
      setAuthError(null);
      await createUserWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signOut = async () => {
    try {
      setAuthError(null);
      await fbSignOut(auth);
    } catch (err: any) {
      const msg = formatAuthErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
