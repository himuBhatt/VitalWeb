import React, { useState } from 'react';
import { db } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useLocation } from "wouter";

const AuthPage: React.FC = () => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [, navigate] = useLocation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim()) {
      alert('Please enter your username');
      return;
    }

    setLoading(true);
    try {
      // find patient document where name == username
      const patientsRef = collection(db, 'patients');
      const q = query(patientsRef, where('name', '==', username.trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        alert('No patient found with that username');
        return;
      }

      // assume first match
      const docSnap = snap.docs[0];
      const data = docSnap.data() as any;
      // compare password field on patient doc
      if (!data.password) {
        alert('Patient has no password set. Contact administrator.');
        return;
      }
      if (data.password !== password) {
        alert('Invalid password');
        return;
      }

      // success: store patient uid and navigate to patient dashboard
      localStorage.setItem('patientUid', docSnap.id);
      localStorage.setItem('patientName', data.name || '');
      navigate('/dashboard/patient');
    } catch (err: any) {
      console.error('Login error:', err);
      alert(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gray-100 p-4 perspective-1000 overflow-hidden">
      {/* 3D Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-200 rounded-full transform rotateX-45 rotateY-45 opacity-20 animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-green-200 rounded-full transform -rotateX-30 -rotateY-30 opacity-30 animate-bounce"></div>
        <div className="absolute bottom-32 left-40 w-28 h-28 bg-purple-200 rounded-full transform rotateX-60 rotateY-60 opacity-25 animate-ping"></div>
        <div className="absolute bottom-20 right-20 w-20 h-20 bg-yellow-200 rounded-full transform -rotateX-45 -rotateY-45 opacity-20 animate-pulse"></div>
      </div>
      <div className="relative z-10 w-full max-w-sm p-8 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Patient Login</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
              <label htmlFor="username" className="block text-gray-700 text-sm font-semibold mb-2">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-gray-700 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">Password</label>
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
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;