import React, { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { useLocation } from "wouter";

const AuthPage: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [, navigate] = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      let userCredential;
      if (mode === "signup") {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
        await addDoc(collection(db, "logins"), {
          email: userCredential.user.email,
          uid: userCredential.user.uid,
          loginTime: new Date().toISOString()
        });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      }

      localStorage.setItem("userEmail", userCredential.user.email || "");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Auth error:", error);
      alert(error.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          {mode === "signup" ? "Sign Up" : "Log In"}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
              <label htmlFor="email" className="block text-gray-700 text-sm font-semibold mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-gray-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-gray-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`w-full font-bold py-2 px-4 rounded-lg transition duration-300 ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? (mode === "signup" ? "Creating account..." : "Logging in...") : (mode === "signup" ? "Sign Up" : "Log In")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="text-blue-600 hover:underline font-semibold"
          >
            {mode === "signup" ? "Log In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
