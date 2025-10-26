import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Globe } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

type Command = {
  phrase: string | RegExp;
  description: string;
  action: (matches: RegExpMatchArray | null) => void | Promise<void>;
};

export default function VoiceAssistant() {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [pendingAction, setPendingAction] = useState<null | { kind: 'navigate' | 'reports' | 'patient'; label: string; path?: string }>(null);
  const [pendingClarify, setPendingClarify] = useState<null | { label: string; options: { key: string; path: string }[] }>(null);
  const recognitionRef = useRef<any>(null);
  // refs to avoid stale closures inside recognition handler
  const pendingActionRef = useRef<typeof pendingAction>(null);
  const pendingClarifyRef = useRef<typeof pendingClarify>(null);

  // keep refs in sync with state
  useEffect(() => { pendingActionRef.current = pendingAction; }, [pendingAction]);
  useEffect(() => { pendingClarifyRef.current = pendingClarify; }, [pendingClarify]);

  // persist/select voice language (en = English, hi = Hindi)
  const [voiceLang, setVoiceLang] = useState<'en' | 'hi' | null>(() => {
    try {
      const v = localStorage.getItem('vital_voice_lang');
      return v === 'hi' ? 'hi' : v === 'en' ? 'en' : null;
    } catch { return null; }
  });
  const [showLangPrompt, setShowLangPrompt] = useState(false);

  // simple localizer: pass English and Hindi strings
  const t = (en: string, hi: string) => (voiceLang === 'hi' ? hi : en);

  // maintain a cached list of available voices and update when browser fires voiceschanged
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setAvailableVoices(window.speechSynthesis.getVoices() || []);
    update();
    // Some browsers populate voices asynchronously
    (window.speechSynthesis as any).onvoiceschanged = update;
    return () => { try { (window.speechSynthesis as any).onvoiceschanged = null; } catch {} };
  }, []);

  // speak with explicit language override so TTS uses the correct voice
  const say = (en: string, hi?: string) => {
    const text = t(en, hi ?? en);
    speak(text, voiceLang ?? 'en');
  };

  const speak = (text: string, langOverride?: 'en' | 'hi') => {
    setLastResponse(text);
    if (!('speechSynthesis' in window)) return;
    const langCode = langOverride ? (langOverride === 'hi' ? 'hi-IN' : 'en-US') : (voiceLang === 'hi' ? 'hi-IN' : 'en-US');
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = langCode;

    // pick a voice from cached list that best matches langCode; fallback to any voice
    try {
      const short = langCode.split('-')[0].toLowerCase();
      let match = availableVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(short));
      if (!match) match = availableVoices.find(v => v.lang && v.lang.toLowerCase().includes(short));
      if (match) ut.voice = match;
      // if voices not loaded yet, retry shortly (one retry)
      if (availableVoices.length === 0) {
        setTimeout(() => {
          const vs = window.speechSynthesis.getVoices() || [];
          const m = vs.find(v => v.lang && v.lang.toLowerCase().startsWith(short)) || vs.find(v => v.lang && v.lang.toLowerCase().includes(short));
          if (m) {
            const ut2 = new SpeechSynthesisUtterance(text);
            ut2.lang = langCode;
            ut2.voice = m;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(ut2);
          } else {
            // final fallback: speak with whatever available
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(ut);
          }
        }, 250);
        return;
      }
    } catch (e) { /* ignore */ }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(ut);
  };

  // when voiceLang changes, update speech recognition language and optionally confirm
  useEffect(() => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.lang = voiceLang === 'hi' ? 'hi-IN' : 'en-US';
      }
    } catch (e) { /* ignore */ }
  }, [voiceLang]);

  // include common Hindi affirm/deny words
  const isPositive = (text: string) => /\b(yes|yeah|yep|sure|ok|okay|confirm|do it|please do|go ahead|हाँ|हा|हां|ठीक(?: है)?|बिलकुल)\b/i.test(text);
  const isNegative = (text: string) => /\b(no|nope|dont|don't|cancel|stop|not now|नहीं|ना|नहि|रुको|बंद)\b/i.test(text);

  const startFollowUpListen = (delay = 700) => {
    // after speaking, restart recognition to capture confirmation
    try {
      setTimeout(() => {
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); setListening(true); } catch (e) { /* ignore */ }
        }
      }, delay);
    } catch (e) {
      // ignore
    }
  };

  // Centralized context helpers
  const isDoctorContext = () => {
    try {
      // Check doctor login path first as highest priority
      if (typeof location === 'string') {
        const p = location.toLowerCase();
        if (p.includes('doc-login') || p.includes('doctor-login')) return true;
      }
      // Check user role as second priority
      if (user) {
        const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
        const r = String(role || '').toLowerCase();
        if (r.includes('doctor')) return true;
      }
      // Check doctor-specific tabs as fallback
      if (typeof location === 'string') {
        const p = location.toLowerCase();
        // dashboard (not patient dashboard) is likely doctor context
        if (p.startsWith('/dashboard') && !p.startsWith('/dashboard/patient')) return true;
        if (p.includes('tab=upload-reports') || p.includes('tab=medi')) return true;
      }
    } catch (e) {
      console.error('[VoiceAssistant] isDoctorContext error', e);
    }
    return false;
  };

  const isPatientContext = () => {
    try {
      if (isDoctorContext()) return false;
      if (user) {
        const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
        const r = String(role || '').toLowerCase();
        if (r.includes('patient')) return true;
      }
      if (typeof location === 'string') {
        const p = location.toLowerCase();
        if (p.includes('/patient') || p.includes('/report') || p.includes('patient-login') || p.includes('patient-dashboard') || p.includes('patient-med')) return true;
      }
      if (typeof window !== 'undefined') {
        const patientId = localStorage.getItem('patientUid');
        if (patientId) return true;
      }
    } catch (e) {
      console.error('[VoiceAssistant] isPatientContext error', e);
    }
    return false;
  };

  const resolvePath = (doctorPath: string, patientPath: string) => {
    // If on doctor login or user is doctor, always use doctor path
    if (typeof location === 'string' && (location.includes('doc-login') || location.includes('doctor-login'))) return doctorPath;
    if (user) {
      const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
      const r = String(role || '').toLowerCase();
      if (r.includes('doctor')) return doctorPath;
    }
    // Otherwise fall back to normal context detection
    return isDoctorContext() ? doctorPath : patientPath;
  };


  // Try to infer a navigation target from arbitrary speech. Returns true if action taken.
  async function inferAndNavigate(text: string): Promise<boolean> {
    const lower = text.toLowerCase();
    // Process full sentence to extract intent and context
    const words = lower.split(/\s+/);
    const actionWords = ['show', 'open', 'go', 'navigate', 'take', 'find', 'display', 'खोलो', 'दिखाओ', 'जाओ', 'ले'];
    const hasActionWord = words.some(w => actionWords.includes(w));
    
    // helper to resolve doctor vs patient routes in one place
    const choose = (doctorPath: string, patientPath: string) => {
      return isDoctorContext() ? doctorPath : patientPath;
    };

    // scoring for known route keywords with context weights
    const candidates: { path: string; score: number; key: string }[] = [];
      const pushIf = (kw: string, path: string, weight = 1) => {
        // Check for exact phrase match first
        if (lower.includes(kw)) {
          const score = weight + (hasActionWord ? 1 : 0);
          // Add context bonus for surrounding words
          const contextBonus = lower.includes('please ' + kw) || lower.includes(kw + ' page') ? 1 : 0;
          
          // allow caller to pass already-resolved paths; otherwise leave as-is
          // (special-case swapping handled by using `choose` when registering keywords)

          candidates.push({ path, score: score + contextBonus, key: kw });
        }
      };
      
      // English keywords with context
      pushIf('dashboard', '/dashboard?tab=overview', 5);
      pushIf('home', '/', 4);
      pushIf('home page', '/', 5);
      pushIf('main page', '/', 5);
  // Always resolve report/report(s) to correct context (doctor -> dashboard tab)
  pushIf('report', choose('/dashboard?tab=upload-reports', '/report'), 5);
  pushIf('reports', choose('/dashboard?tab=upload-reports', '/report'), 5);
  pushIf('medical reports', choose('/dashboard?tab=upload-reports', '/report'), 6);
  pushIf('patient reports', choose('/dashboard?tab=upload-reports', '/report'), 6);
      pushIf('setting', '/settings', 5);
      pushIf('settings page', '/settings', 6);
      pushIf('alert', '/dashboard?tab=alerts', 5);
      pushIf('alerts', '/dashboard?tab=alerts', 5);
      pushIf('notifications', '/dashboard?tab=alerts', 5);
      pushIf('profile', '/profile', 5);
      pushIf('my profile', '/profile', 6);
      pushIf('user profile', '/profile', 6);
      pushIf('add patient', '/dashboard?tab=add-patient', 6);
      pushIf('new patient', '/dashboard?tab=add-patient', 6);
      pushIf('create patient', '/dashboard?tab=add-patient', 6);
      pushIf('patient', '/dashboard?tab=patients', 5);
      pushIf('patients', '/dashboard?tab=patients', 5);
      pushIf('patient list', '/dashboard?tab=patients', 6);
      pushIf('all patients', '/dashboard?tab=patients', 6);
      pushIf('doctor', '/professionals', 3);
      pushIf('doctors', '/professionals', 3);
      pushIf('professionals', '/professionals', 4);
      
      // Hindi keywords with context - defaults to patient paths, will be changed to doctor paths if not in patient context
      pushIf('डैशबोर्ड', '/dashboard?tab=overview', 5);
      pushIf('मुख्य पृष्ठ', '/dashboard?tab=overview', 6);
      pushIf('घर', '/', 4);
      pushIf('मुख्य पेज', '/', 5);
  pushIf('रिपोर्ट', choose('/dashboard?tab=upload-reports', '/report'), 5);
  pushIf('रिपोर्ट्स', choose('/dashboard?tab=upload-reports', '/report'), 5);
  pushIf('मरीज रिपोर्ट', choose('/dashboard?tab=upload-reports', '/report'), 6);
  // Medicine/medicines/medi context-aware navigation
  pushIf('medicine', choose('/medi', '/patient-med'), 5);
  pushIf('medicines', choose('/medi', '/patient-med'), 5);
  pushIf('medi', choose('/medi', '/patient-med'), 5);
  pushIf('दवा', choose('/medi', '/patient-med'), 5);
  pushIf('दवाइयां', choose('/medi', '/patient-med'), 5);
  pushIf('दवाई', choose('/medi', '/patient-med'), 5);
  pushIf('दवाइयाँ', choose('/medi', '/patient-med'), 5);
      pushIf('सेटिंग', '/settings', 5);
      pushIf('सेटिंग्स', '/settings', 5);
      pushIf('अलर्ट', '/dashboard?tab=alerts', 5);
      pushIf('सूचनाएं', '/dashboard?tab=alerts', 6);
      pushIf('प्रोफ़ाइल', '/profile', 5);
      pushIf('मेरी प्रोफ़ाइल', '/profile', 6);
      // Add patient commands in Hindi with high priority
      pushIf('नया मरीज जोड़ो', '/dashboard?tab=add-patient', 7);
      pushIf('नया मरीज़ जोड़ो', '/dashboard?tab=add-patient', 7);
      pushIf('नये मरीज जोड़ो', '/dashboard?tab=add-patient', 7);
      pushIf('मरीज जोड़ना', '/dashboard?tab=add-patient', 6);
      pushIf('मरीज जोड़ो', '/dashboard?tab=add-patient', 6);
      pushIf('नया मरीज', '/dashboard?tab=add-patient', 6);
      // Patient list commands
      pushIf('मरीज', '/dashboard?tab=patients', 5);
      pushIf('मरीज सूची', '/dashboard?tab=patients', 6);
      pushIf('रोगी', '/dashboard?tab=patients', 5);
      pushIf('रोगी सूची', '/dashboard?tab=patients', 6);
      pushIf('डॉक्टर', '/professionals', 3);
      pushIf('चिकित्सक', '/professionals', 4);    // choose best candidate
    if (candidates.length > 0) {
      candidates.sort((a,b) => b.score - a.score);
      const top = candidates[0];
      if (top.score >= 4) {
        say(`Okay, opening ${top.key}`, `ठीक है, खोल रहा हूँ ${top.key}`);
        navigate(top.path);
        return true;
      }
    }

    // Fallback: attempt a patient name lookup — if found, open their reports/dashboard
    try {
      const possiblyName = lower.replace(/(please|open|show|for|of|the|reports|report|patient|profile|dashboard|settings|go to|take me to|navigate to|कृपया|खोलो|खोल|दिखाओ|दिखाओ|मरीज|रोगी)/g, '').trim();
      if (possiblyName.length > 2) {
        const snap = await getDocs(collection(db, 'patients'));
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const found = all.find((p:any) => (p.name || '').toLowerCase().includes(possiblyName));
        if (found) {
          say(`I found ${found.name}. Opening dashboard for them.`, `${found.name} मिला। उसके लिए डैशबोर्ड खोल रहा हूँ।`);
          navigate(`/dashboard?patientId=${found.id}`);
          return true;
        }
      }
    } catch (e) {
      // ignore lookup errors
    }

    return false;
  }

  // use wouter navigation setter so route changes are handled by the app
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  
  const navigate = (path: string) => {
    try {
      setLocation(path);
      // Some components (like Dashboard) listen for 'popstate' to read query params
      // Dispatch a popstate so they can react to the updated query string.
      try { window.dispatchEvent(new PopStateEvent('popstate')); } catch (e) { /* ignore */ }
    } catch (e) {
      // fallback to full location change
      window.location.href = path;
    }
    // if navigating to dashboard and user hasn't chosen a voice, prompt
    try {
      if (!voiceLang && path.startsWith('/dashboard')) setShowLangPrompt(true);
    } catch {}
  };

  // when component mounts or location changes, if on dashboard and no voice selected show prompt
  useEffect(() => {
    try {
      if (!voiceLang && location && location.startsWith('/dashboard')) {
        setShowLangPrompt(true);
      } else {
        setShowLangPrompt(false);
      }
    } catch (e) { /* ignore */ }
  }, [location, voiceLang]);

  // helper to pick and persist language
  const selectLanguage = (lang: 'en' | 'hi') => {
    try { localStorage.setItem('vital_voice_lang', lang); } catch {}
    setVoiceLang(lang);
    setShowLangPrompt(false);
    // update recognition immediately
    try { if (recognitionRef.current) recognitionRef.current.lang = lang === 'hi' ? 'hi-IN' : 'en-US'; } catch {}
    // confirm in chosen language immediately (use lang override so TTS uses correct voice even before state update)
    if (lang === 'hi') speak('अब मैं हिंदी में बोलूँगा', 'hi'); else speak('Voice set to English', 'en');
  };

  // allow user to clear or reopen language chooser at any time
  const clearLanguage = () => {
    try { localStorage.removeItem('vital_voice_lang'); } catch {}
    setVoiceLang(null);
    setShowLangPrompt(true); // open chooser so user can pick again
    say('Language cleared. Please select a language.', 'भाषा हटा दी गई है। कृपया एक भाषा चुनें।');
  };

  const commands: Command[] = [
    // Explicit: Doctor - Upload Reports
    {
      phrase: /(?:open|show|go to|navigate to|खोलो|दिखाओ|जाओ|ले जाओ|upload report|upload reports|अपलोड रिपोर्ट|अपलोड रिपोर्ट्स)/i,
      description: 'Doctor: Open upload reports tab',
      action: () => {
        // Only trigger if in doctor context (login or tab)
        const isDoctor = (() => {
          if (typeof location === 'string') {
            const path = location.toLowerCase();
            if (path.includes('doc-login') || path.includes('doctor-login') || path.includes('tab=upload-reports')) return true;
          }
          if (user) {
            const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
            const r = String(role || '').toLowerCase();
            if (r.includes('doctor')) return true;
          }
          return false;
        })();
        if (isDoctor) {
          say('Opening upload reports tab', 'अपलोड रिपोर्ट टैब खोल रहा हूँ');
          navigate('/dashboard?tab=upload-reports');
        }
      }
    },

    // Explicit: Patient - My Reports
    {
      phrase: /(?:open|show|go to|navigate to|खोलो|दिखाओ|जाओ|ले जाओ|my report|my reports|मेरी रिपोर्ट|मेरी रिपोर्ट्स|patient report|patient reports|रिपोर्ट|रिपोर्ट्स)/i,
      description: 'Patient: Open my reports page',
      action: () => {
        // Only trigger if in patient context (login, tab, user role or patientUid)
        // Use centralized helper so doctor context always takes priority
        const isPatient = isPatientContext();
        if (isPatient) {
          say('Opening your reports page', 'आपकी रिपोर्ट पृष्ठ खोल रहा हूँ');
          navigate('/report');
        }
      }
    },
    // High priority Hindi "नया मरीज जोड़ो" command
    {
      phrase: /^\s*(?:नया\s+मरीज़?\s+जोड़ो|नये\s+मरीज़?\s+जोड़ो)\s*$/i,
      description: 'Add new patient (Hindi specific)',
      action: () => {
        if (voiceLang !== 'hi') {
          try { selectLanguage('hi'); } catch (e) { /* ignore */ }
        }
        say('Opening add patient tab', 'मरीज जोड़ने का पेज खोल रहा हूँ');
        navigate('/dashboard?tab=add-patient');
      }
    },

    // Explicit alerts command (English + Hindi)
    { phrase: /(?:open|show|view|खोल|दिखा|दिखाओ) (?:alert|alerts|अलर्ट|अलर्ट्स)?/i, description: 'Open alerts tab', action: () => { say('Opening alerts tab', 'अलर्ट टैब खोल रहा हूँ'); navigate('/dashboard?tab=alerts'); } },

    // General Add Patient command (after specific Hindi command)
    {
      phrase: /(?:add|create|new)\s+patient|add-patient|मरीज\s*जोड़(?:ो|ें|ना|िये|े)|मरीज\s*जोड़ना|मरीज़\s*जोड़ना/i,
      description: 'Open add patient tab',
      action: (m) => {
        const matched = String(m?.[0] ?? '');
        const hasHindi = /[\u0900-\u097F]/.test(matched) || /[\u0900-\u097F]/.test((transcript||''));
        if (hasHindi && voiceLang !== 'hi') {
          try { selectLanguage('hi'); } catch (e) { /* ignore */ }
        }
        say('Opening add patient tab', 'मरीज जोड़ने का पेज खोल रहा हूँ');
        navigate('/dashboard?tab=add-patient');
      }
    },

  // Explicit patients command (English + Hindi)
    {
      phrase: /(?:^(?!.*(?:नया|नये)\s*मरीज).*\b(?:patient list|patientlist|patient-list|मरीज सूची|मरीज लिस्ट|रोगी सूची|पेशेंट लिस्ट)\b|^(?!.*(?:नया|नये)\s*मरीज).*\b(?:show|view|खोल|दिखा|दिखाओ)\s+(?:patient|patients|मरीज|मरीज़|रोगी|पेशेंट)\b)/i,
      description: 'Open patients tab',
      action: (m) => {
        // if Hindi characters detected in the spoken phrase, prefer Hindi TTS
        const raw = String(m?.[0] ?? transcript ?? '');
        const hasHindi = /[\u0900-\u097F]/.test(raw);
        if (hasHindi && voiceLang !== 'hi') {
          try { selectLanguage('hi'); } catch (e) { /* ignore */ }
        }
        say('Opening patients tab', 'मरीज टैब खोल रहा हूँ');
        navigate('/dashboard?tab=patients');
      }
    },

  // Alarms / Alerts in Hindi and English (include common transliterations)
  { phrase: /(?:alarm|alaram|alarms|alert|alerts|अलार्म|अलार्म्स|अलर्ट|अलर्ट्स|सूचना|सूचनाएं)/i, description: 'Open alerts tab', action: () => { say('Opening alerts tab', 'अलर्ट टैब खोल रहा हूँ'); navigate('/dashboard?tab=alerts'); } },

    // Medicine / Medicines (English + Hindi) — open medicine reminder page (doctor or patient side)
    { phrase: /(?:medicine|medicines|medicine tab|medicine reminder|medi|medicines tab|दवा|दवाइयां|दवाई|दवाइयाँ|दवा टैब|दवा अनुस्मारक|दवा याद|दवा रिमाइंडर)/i, description: 'Open medicine/medi page', action: (m) => {
      const raw = String(m?.[0] ?? '');
      const hasHindi = /[\u0900-\u097F]/.test(raw);
      if (hasHindi && voiceLang !== 'hi') { try { selectLanguage('hi'); } catch (e) { /* ignore */ } }
      // Use robust context detection for doctor vs patient
      // Always use doctor paths if on doctor login or user is a doctor
      const forceDoctorPath = () => {
        if (typeof location === 'string' && (location.includes('doc-login') || location.includes('doctor-login'))) return true;
        if (user) {
          const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
          return String(role || '').toLowerCase().includes('doctor');
        }
        return false;
      };

      // If in doctor context, always use doctor paths
      const path = forceDoctorPath() ? '/medi' : '/patient-med';
      if (path === '/patient-med') {
        say('Opening your medicines', 'आपकी दवाइयाँ खोल रहा हूँ');
      } else {
        say('Opening medicine reminders', 'दवा अनुस्मारक खोल रहा हूँ');
      }
      navigate(path);
    } },

    // Find patient with full sentence support and Hindi phrasing
    { phrase: /(?:show|find|check|search|tell|get|दिखाओ|खोजो|बताओ).*(?:patient|मरीज|रोगी|patient's?|मरीजों?|रोगियों?).*(?:named?|called|by name|नाम|नाम से|नाम का|नाम की)?\s+(.+?)(?:\s+(?:details?|information|status|records?|जानकारी|विवरण|स्थिति|रिकॉर्ड))?$/i, description: 'Find patient by name or id and read details', action: async (m) => {
      // Extract name from the full sentence
      const qRaw = (m?.[1] || '').toString().trim();
      if (!qRaw) return say("I didn't catch the patient name. Could you please repeat it?", 'मरीज़ का नाम सुनाई नहीं दिया। कृपया दोहराएं?');
      const q = qRaw.toLowerCase(); 
      say(`Searching for information about patient ${qRaw}`, `${qRaw} के बारे में जानकारी खोज रहा हूँ`);
      try {
        const snap = await getDocs(collection(db, 'patients'));
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const found = all.find((p:any) => ((p.name||'').toLowerCase().includes(q) || String(p.id||'').toLowerCase().includes(q)));
        if (!found) return say(`I couldn't find any patient matching ${qRaw}. Please try again with a different name.`, `${qRaw} से मिलता जुलता कोई मरीज नहीं मिला। कृपया दूसरे नाम से प्रयास करें।`);
        
        // Build a more natural response
        const parts: string[] = []; 
        parts.push(`Patient name is ${found.name}`);
        if (found.age) parts.push(`they are ${found.age} years old`);
        if (found.room) parts.push(`currently in room ${found.room}`);
        if (found.gender) parts.push(`their gender is ${found.gender}`);
        if (found.doctorName) parts.push(`under the care of Dr. ${found.doctorName}`);
        if (found.status) parts.push(`current status is ${found.status}`);
        if (found.latestTemperature != null) parts.push(`latest recorded temperature is ${found.latestTemperature}`);
        
        // Hindi response with more natural language
        const hindiResponse = `${found.name} की जानकारी: ${found.age ? `उम्र ${found.age} वर्ष` : ''} ${found.room ? `कमरा नंबर ${found.room}` : ''} ${found.doctorName ? `डॉक्टर ${found.doctorName} की देखरेख में` : ''} ${found.status ? `वर्तमान स्थिति ${found.status}` : ''}`;
        
        // Speak summary in a more conversational way
        speak(voiceLang === 'hi' ? hindiResponse : `Here's what I found about ${found.name}. ${parts.join('. ')}`);
        try { navigate(`/dashboard?tab=patients&patientId=${found.id}`); } catch(e){}
      } catch(err) { console.error('Error searching patients', err); say('Failed to search patients.', 'मरीज खोजने में विफल रहा।'); }
    }},

    // Open/generate reports; optional patient name (supports Hindi)
    { phrase: /(?:open|show|generate|खोल|दिखाओ|बनाओ) (?:report|reports|रिपोर्ट|रिपोर्ट्स)(?: (?:for|के लिए) (?:patient )?(.+))?/i, description: 'Open reports for a patient or reports page', action: async (m) => {
      const who = m?.[1]?.trim();
      
      // Always use doctor paths if on doctor login or user is a doctor
      const forceDoctorPath = () => {
        if (typeof location === 'string' && (location.includes('doc-login') || location.includes('doctor-login'))) return true;
        if (user) {
          const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
          return String(role || '').toLowerCase().includes('doctor');
        }
        return false;
      };
      
      if (!who) {
          const path = forceDoctorPath() ? '/dashboard?tab=upload-reports' : '/report';
        if (path === '/report') {
          say('Opening your reports page', 'आपकी रिपोर्ट पृष्ठ खोल रहा हूँ');
        } else {
          say('Opening reports tab', 'रिपोर्ट टैब खोल रहा हूँ');
        }
        navigate(path);
        return;
      }
      const q = who.toLowerCase(); say(`Searching for patient ${who} to open reports`, `${who} के लिए रिपोर्ट खोलने हेतु खोज रहा हूँ`);
      try {
        const snap = await getDocs(collection(db, 'patients'));
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const found = all.find((p:any) => ((p.name||'').toLowerCase().includes(q) || String(p.id||'').toLowerCase().includes(q)));
        if (!found) return say(`No patient found matching ${who}`, `${who} के साथ कोई मरीज नहीं मिला`);
        
        // Always use doctor paths if on doctor login or user is a doctor
        const forceDoctorPath = () => {
          if (typeof location === 'string' && (location.includes('doc-login') || location.includes('doctor-login'))) return true;
          if (user) {
            const role = (user as any).role || (user as any).type || (user as any).userRole || (user as any).accountType;
            return String(role || '').toLowerCase().includes('doctor');
          }
          return false;
        };

  // If in doctor context, always use doctor paths (dashboard tab)
  const path = forceDoctorPath() ? `/dashboard?tab=upload-reports&patientId=${found.id}` : `/report?patientId=${found.id}`;
        navigate(path);
        say(`Opening reports for ${found.name}`, `${found.name} के लिए रिपोर्ट खोल रहा हूँ`);
      } catch(err) { console.error('Error opening reports', err); say('Failed to open reports for that patient.', 'उस मरीज के लिए रिपोर्ट खोलने में विफल।'); }
    }},

    // Generic navigation (fallback) — supports Hindi verbs
    { phrase: /(?:go to|open|navigate to|take me to|जाओ|खोलो|ले जाओ|ले चलो|मुझे ले चलो) (.+)/i, description: 'Navigate to a page', action: (m) => {
      const raw = m?.[1]?.trim();
      if (!raw) return say("I didn't catch the page name.", 'पेज का नाम सुनाई नहीं दिया।');
      const target = raw.toLowerCase();
      // quick keyword matching for known tabs
      const options: { key: string; path: string }[] = [];
      // Context-aware choose helper
      const choose = (doctorPath: string, patientPath: string) => isDoctorContext() ? doctorPath : patientPath;
      // Add context-aware report/medicine
      const addIf = (kw: string, path: string) => { if (target.includes(kw)) options.push({ key: kw, path }); };
      addIf('dash', '/dashboard?tab=overview'); addIf('dashboard', '/dashboard?tab=overview'); addIf('डैश', '/dashboard?tab=overview'); addIf('डैशबोर्ड', '/dashboard?tab=overview');
  addIf('report', choose('/dashboard?tab=upload-reports', '/report')); addIf('रिपोर्ट', choose('/dashboard?tab=upload-reports', '/report'));
      addIf('setting', '/settings'); addIf('सेटिंग', '/settings'); addIf('profile', '/profile'); addIf('प्रोफ़ाइल', '/profile'); addIf('home', '/'); addIf('घर', '/');
      addIf('add', '/dashboard?tab=add-patient'); addIf('add patient', '/dashboard?tab=add-patient'); addIf('add-patient', '/dashboard?tab=add-patient'); addIf('मरीज', '/dashboard?tab=patients'); addIf('रोगी', '/dashboard?tab=patients');
      addIf('medi', choose('/medi', '/patient-med'));
      addIf('medicine', choose('/medi', '/patient-med'));
      addIf('medicines', choose('/medi', '/patient-med'));
      addIf('दवा', choose('/medi', '/patient-med'));
      addIf('दवाइयां', choose('/medi', '/patient-med'));
      addIf('दवाई', choose('/medi', '/patient-med'));
      addIf('दवाइयाँ', choose('/medi', '/patient-med'));

      // Map for direct matches
      const map: Record<string,string> = {
        dashboard: '/dashboard?tab=overview',
        home: '/',
        landing: '/',
        login: '/login',
        professionals: '/professionals',
        'add patient': '/dashboard?tab=add-patient',
        settings: '/settings',
        profile: '/profile',
      };
      // Context-aware report/medicine
  map['upload reports'] = choose('/dashboard?tab=upload-reports', '/report');
  map['reports'] = choose('/dashboard?tab=upload-reports', '/report');
  map['report'] = choose('/dashboard?tab=upload-reports', '/report');
      map['medi'] = choose('/medi', '/patient-med');
      map['medicine'] = choose('/medi', '/patient-med');
      map['medicines'] = choose('/medi', '/patient-med');

      if (map[target]) {
        setPendingAction({ kind: 'navigate', label: target, path: map[target] });
        say(`Do you want me to open ${target}?`, `क्या मैं ${target} खोल दूँ?`);
        startFollowUpListen();
        return;
      }

      if (options.length === 1) {
        setPendingAction({ kind: 'navigate', label: options[0].key, path: options[0].path });
        say(`Do you want me to open ${options[0].key}?`, `क्या मैं ${options[0].key} खोल दूँ?`);
        startFollowUpListen();
        return;
      }

      if (options.length > 1) {
        setPendingClarify({ label: raw, options });
        const names = options.map(o => o.key).slice(0,3).join(' or ');
        say(`Do you mean ${names}?`, `क्या आपका मतलब ${names} है?`);
        startFollowUpListen();
        return;
      }

      const fallbackPath = map[target] || `/${target.replace(/ /g,'-')}`;
      setPendingAction({ kind: 'navigate', label: raw, path: fallbackPath });
      say(`Do you want me to open ${raw}?`, `क्या मैं ${raw} खोल दूँ?`);
      startFollowUpListen();
    }},

    { phrase: /read (?:the )?page|पढ़ो|पढ़ें|पेज पढ़ो/i, description: 'Read visible page content', action: () => {
      const main = document.querySelector('main') || document.body; const text = (main?.textContent||'').replace(/\s+/g,' ').slice(0,1500); if (!text) return say('There is no readable content on this page.', 'इस पृष्ठ पर पढ़ने योग्य सामग्री नहीं है।'); speak(text);
    }},

    { phrase: /help|what can you do|क्या कर सकते हो|मदद/i, description: 'List commands', action: () => say('You can say: go to dashboard, open add patient, show patient John, open reports for John, read page, or stop listening.', 'आप कह सकते हैं: डैशबोर्ड खोलो, मरीज़ जोड़ो, मरीज जॉन दिखाओ, जॉन के लिए रिपोर्ट खोलो, पेज पढ़ो, या सुनना बंद करो।') },

    { phrase: /stop listening|stop|रुको|बंद करो|बंद/i, description: 'Stop listening', action: () => { stopListening(); say('Stopped listening.', 'सुनना बंद कर दिया गया।'); } }
  ];

  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) { setSupported(false); return; }
    const r = new SpeechRecognition(); r.interimResults = false; r.lang = voiceLang === 'hi' ? 'hi-IN' : 'en-US'; r.maxAlternatives = 1;
    r.onresult = async (ev:any) => {
      const text = ev.results[0][0].transcript; setTranscript(text);

      // If we're waiting for a confirmation
      const pa = pendingActionRef.current;
      if (pa) {
        if (isPositive(text)) {
          // execute pending action
          if (pa.kind === 'navigate' && pa.path) {
-            speak(`Okay, opening ${pa.label}`);
+            say(`Okay, opening ${pa.label}`, `ठीक है, खोल रहा हूँ ${pa.label}`);
            navigate(pa.path);
          } else if (pa.kind === 'reports' && pa.path) {
-            speak(`Opening reports for ${pa.label}`);
+            say(`Opening reports for ${pa.label}`, `${pa.label} के लिए रिपोर्ट खोल रहा हूँ`);
            navigate(pa.path);
          }
          setPendingAction(null);
          setListening(false);
          return;
        }
        if (isNegative(text)) {
-          speak('Okay, cancelled.');
+          say('Okay, cancelled.', 'ठीक है, रद्द कर दिया गया।');
          setPendingAction(null);
          setListening(false);
          return;
        }
        // if not clear, ask again
-        speak("I didn't catch that — please say yes or no.");
+        say("I didn't catch that — please say yes or no.", 'मैं स्पष्ट रूप से नहीं सुन पाया — कृपया हाँ या नहीं कहें।');
        startFollowUpListen();
        return;
      }

      // If we're waiting for clarification among options
      const pc = pendingClarifyRef.current;
      if (pc) {
        // try match one of the option keys
        const lower = text.toLowerCase();
        const match = pc.options.find(o => lower.includes(o.key));
        if (match) {
-          speak(`Opening ${match.key}`);
+          say(`Opening ${match.key}`, `खोल रहा हूँ ${match.key}`);
          navigate(match.path);
          setPendingClarify(null);
          setListening(false);
          return;
        }
        if (isNegative(text)) {
-          speak('Okay, cancelled.');
+          say('Okay, cancelled.', 'ठीक है, रद्द कर दिया गया।');
          setPendingClarify(null);
          setListening(false);
          return;
        }
        // not matched, ask to repeat choices
        const names = pc.options.map(o => o.key).slice(0,3).join(' or ');
-        speak(`I didn't get that. Did you mean ${names}?`);
+        say(`I didn't get that. Did you mean ${names}?`, `मैं समझ नहीं पाया। क्या आपका मतलब ${names} है?`);
        startFollowUpListen();
        return;
      }

      // Otherwise handle normal commands
      // If we're clearly in doctor-login or user is a doctor, force doctor-specific routes for common keywords
      try {
        const lowerText = text.toLowerCase();
  const inDoctorContext = isDoctorContext();
  if (inDoctorContext && lowerText.match(/\breport|reports|upload report|रिपोर्ट|रिपोर्ट्स|अपलोड रिपोर्ट/)) {
          // Force open the dashboard upload-reports tab for doctor context
          say('Opening upload reports tab', 'रिपोर्ट अपलोड टैब खोल रहा हूँ');
          navigate('/dashboard?tab=upload-reports');
          setListening(false);
          setPendingAction(null);
          setPendingClarify(null);
          return;
        }
  if (inDoctorContext && lowerText.match(/\bmedi|medicine|medicines|दवा|दवाइयां|दवाई/)) {
          say('Opening medicine reminders', 'दवा अनुस्मारक खोल रहा हूँ');
          navigate('/medi');
          setListening(false);
          setPendingAction(null);
          setPendingClarify(null);
          return;
        }
      } catch (e) {
        // ignore guard errors and continue to normal handling
        console.warn('[VoiceAssistant] doctor override guard error', e);
      }

      let matched = false;
      for (const c of commands) {
        const pattern = c.phrase;
        if (typeof pattern === 'string') {
          if (text.toLowerCase().includes(pattern.toLowerCase())) { (c as any).action(null); matched = true; break; }
        } else {
          const m = text.match(pattern as RegExp);
          if (m) { (c as any).action(m); matched = true; break; }
        }
      }
      if (!matched) {
        // Attempt to infer navigation automatically from free-form speech
        const inferred = await inferAndNavigate(text);
        if (!inferred) {
-          speak("Sorry, I couldn't determine where to go. Say 'help' for examples or try again.");
+          say("Sorry, I couldn't determine where to go. Say 'help' for examples or try again.", 'क्षमा करें, मैं निर्धारित नहीं कर पाया कि कहाँ जाना है। उदाहरणों के लिए "मदद" कहें या फिर से प्रयास करें।');
        }
      }
    };
    r.onerror = (ev:any) => { console.error('Speech recognition error', ev); setListening(false); say('I encountered an error listening.', 'सुनने में त्रुटि हुई।'); };
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    return () => { try { r.onresult = null; r.onerror = null; r.onend = null; } catch (e) {} };
  }, [voiceLang]);

  const startListening = async () => {
    if (!recognitionRef.current) return say('Speech recognition is not supported in this browser.', 'आपके ब्राउज़र में स्पीच रिकग्निशन समर्थित नहीं है।');
    try { setTranscript(''); setListening(true); recognitionRef.current.start(); say('Listening', 'सुन रहा हूँ'); } catch (e:any) { console.error(e); setListening(false); say('Failed to start listening.', 'सुनना शुरू करने में विफल।'); }
  };

  const stopListening = () => { if (!recognitionRef.current) return; try { recognitionRef.current.stop(); } catch (e) {} setListening(false); };

  return (
    <div className="flex items-center space-x-2 bg-card/80 backdrop-blur-sm p-1 rounded-md shadow-sm">
      {!supported && <div className="text-xs text-destructive mr-2">Voice not supported</div>}

      {/* compact icon buttons to avoid taking extra space in header */}
      <Button
        variant={listening ? 'destructive' : 'ghost'}
        size="sm"
        onClick={() => (listening ? stopListening() : startListening())}
        title={listening ? 'Stop listening' : 'Start voice assistant'}
        data-testid="button-voice-assistant"
        className="p-2 w-9 h-9"
      >
        <Mic className="w-4 h-4" />
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowLangPrompt(true)}
        data-testid="btn-open-lang"
        className="p-2 w-9 h-9"
        title={voiceLang ? (voiceLang === 'hi' ? 'हिंदी' : 'English') : 'Choose language'}
      >
        <Globe className="w-4 h-4" />
      </Button>

      {/* language selection prompt shown when opening dashboard and no language chosen yet */}
      {showLangPrompt && (
        <div className="ml-2 p-2 bg-muted rounded-md text-sm text-right">
          <div className="mb-1">Select voice language / भाषा चुनें</div>
          <div className="flex justify-end space-x-2">
            <Button size="sm" onClick={() => selectLanguage('en')} data-testid="btn-voice-en">English</Button>
            <Button size="sm" onClick={() => selectLanguage('hi')} data-testid="btn-voice-hi">हिंदी</Button>
            {voiceLang && <Button size="sm" variant="ghost" onClick={clearLanguage} data-testid="btn-clear-lang">Clear</Button>}
            <Button size="sm" variant="ghost" onClick={() => setShowLangPrompt(false)} data-testid="btn-close-lang">Close</Button>
          </div>
          <div className="text-xs text-muted-foreground mt-1">You can change this later in your browser settings or by clearing site storage.</div>
        </div>
      )}

      <div className="sr-only sm:not-sr-only text-xs text-muted-foreground ml-2">{transcript || lastResponse || 'Say "help"'}</div>
    </div>
  );
}
