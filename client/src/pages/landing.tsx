import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Shield, Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md max-h-[90vh] overflow-auto">
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
