import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import VoiceAssistant from '@/components/VoiceAssistant';
import { useEffect, useState } from 'react';
import { Heart, Shield, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const [, navigate] = useLocation();
  const [selectedLang, setSelectedLang] = useState<string | null>(() => { try { return sessionStorage.getItem('vital_voice_lang'); } catch { return null; } });
  const [lastHeard, setLastHeard] = useState<string | null>(null);

  useEffect(() => {
    const onLang = (e: any) => setSelectedLang(e?.detail?.lang ?? null);
    const onTranscript = (e: any) => setLastHeard(e?.detail?.transcript ?? null);
    const onFallback = () => setShowFallback(true);
    const onListening = (e: any) => setListening(e?.detail?.listening ?? false);
    window.addEventListener('vitalVoice:languageSelected', onLang as any);
    window.addEventListener('vitalVoice:transcript', onTranscript as any);
    window.addEventListener('vitalVoice:landingFallback', onFallback as any);
    window.addEventListener('vitalVoice:landingListening', onListening as any);
    return () => {
      window.removeEventListener('vitalVoice:languageSelected', onLang as any);
      window.removeEventListener('vitalVoice:transcript', onTranscript as any);
      window.removeEventListener('vitalVoice:landingFallback', onFallback as any);
      window.removeEventListener('vitalVoice:landingListening', onListening as any);
    };
  }, []);

  const [showFallback, setShowFallback] = useState(false);
  const [listening, setListening] = useState(false);
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-primary/10 to-accent perspective-1000 overflow-hidden">
      {/* 3D Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-32 h-32 bg-blue-200 rounded-full transform rotateX-45 rotateY-45 opacity-20 animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-green-200 rounded-full transform -rotateX-30 -rotateY-30 opacity-30 animate-bounce"></div>
        <div className="absolute bottom-32 left-40 w-28 h-28 bg-purple-200 rounded-full transform rotateX-60 rotateY-60 opacity-25 animate-ping"></div>
        <div className="absolute bottom-20 right-20 w-20 h-20 bg-yellow-200 rounded-full transform -rotateX-45 -rotateY-45 opacity-20 animate-pulse"></div>
      </div>
      {/* Landing page auto voice assistant: greets and asks for language selection automatically */}
      <VoiceAssistant autoStart hideUI greetOnMount />
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-card/80 backdrop-blur-sm p-2 rounded-md text-sm text-center shadow">
            {selectedLang ? (
              <div>Selected language: <strong>{selectedLang === 'hi' ? 'हिंदी' : 'English'}</strong></div>
            ) : (
              <div>{listening ? <span>Listening for language selection…</span> : <span>Please select a language</span>}</div>
            )}
            <div className="text-xs text-muted-foreground">Last heard: <em>{lastHeard ?? '—'}</em></div>
          </div>
        </div>
        <div className="w-full max-w-md max-h-[90vh] overflow-auto">
          {showFallback && !selectedLang && (
            <div className="mb-4 p-3 bg-destructive/5 border border-destructive rounded-md text-center">
              <div className="mb-2 font-medium">Microphone unavailable or not responding.</div>
              <div className="text-sm mb-2">Please select your language manually:</div>
                <div className="flex justify-center space-x-2">
                <Button onClick={() => { try { sessionStorage.setItem('vital_voice_lang','hi'); } catch {} ; window.dispatchEvent(new CustomEvent('vitalVoice:setLanguage',{ detail: { lang: 'hi' } })); setSelectedLang('hi'); setShowFallback(false); }} className="w-32">हिंदी</Button>
                <Button onClick={() => { try { sessionStorage.setItem('vital_voice_lang','en'); } catch {} ; window.dispatchEvent(new CustomEvent('vitalVoice:setLanguage',{ detail: { lang: 'en' } })); setSelectedLang('en'); setShowFallback(false); }} className="w-32">English</Button>
              </div>
            </div>
          )}
          <Card className="w-full">
            <CardContent className="pt-6">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
                  <Heart className="w-8 h-8 text-primary-foreground" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">VitalCare</h1>
                <p className="text-muted-foreground">Patient Monitoring System</p>
              </div>
              <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-3">
                  <Activity className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground">Real-time vital monitoring</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground">Instant critical alerts</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground">Patient management</span>
                </div>
              </div>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <Button className="w-full" onClick={() => navigate("/doc-login")}>Doctor</Button>
                  <Button className="w-full" onClick={() => navigate("/patient-login")}>Patient</Button>
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
