import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface AlertModalProps {
  alert: {
    id: string;
    title: string;
    description: string;
    type: string;
    temperature?:number;
    heartRate?:number;
    oxygenLevel?:number;
  };
  normalValues:{
    temperature:number;
    heartRate:number;
    oxygenLevel:number;
  }
  onClose: () => void;
}

export default function AlertModal({ alert, normalValues, onClose }: AlertModalProps) {
  // Helper to check for abnormalities
  const abnormalities: string[] = [];
  if (alert.temperature !== undefined && (alert.temperature < normalValues.temperature - 1 || alert.temperature > normalValues.temperature + 1)) {
    abnormalities.push(`Temperature abnormal: ${alert.temperature}°C (Normal: ${normalValues.temperature}°C)`);
  }
  if (alert.heartRate !== undefined && (alert.heartRate < normalValues.heartRate - 10 || alert.heartRate > normalValues.heartRate + 10)) {
    abnormalities.push(`Heart Rate abnormal: ${alert.heartRate} bpm (Normal: ${normalValues.heartRate} bpm)`);
  }
  if (alert.oxygenLevel !== undefined && (alert.oxygenLevel < normalValues.oxygenLevel - 3)) {
    abnormalities.push(`Oxygen Level abnormal: ${alert.oxygenLevel}% (Normal: ${normalValues.oxygenLevel}%)`);
  }
  const { toast } = useToast();

  const acknowledgeAlertMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/alerts/${alert.id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/alerts/unacknowledged'] });
      toast({
        title: "Alert Acknowledged",
        description: "Critical alert has been acknowledged.",
      });
      onClose();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to acknowledge alert.",
        variant: "destructive",
      });
    },
  });

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      data-testid="alert-modal"
    >
      <Card className="w-full max-w-md notification-slide">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-destructive rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-destructive">CRITICAL ALERT</h3>
              <p className="text-sm text-muted-foreground">Immediate attention required</p>
            </div>
          </div>
          
          <div className="mb-6">
          {/* Vital Comparison Section */}
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Vital Comparison</h4>
            <ul className="space-y-1 text-sm">
              {alert.temperature !== undefined && (
                <li>
                  Temperature: <span className={abnormalities.find(a => a.includes('Temperature')) ? 'text-destructive font-bold' : ''}>{alert.temperature}°C</span>
                  <span className="ml-2 text-muted-foreground text-xs">(Normal: {normalValues.temperature}°C)</span>
                </li>
              )}
              {alert.heartRate !== undefined && (
                <li>
                  Heart Rate: <span className={abnormalities.find(a => a.includes('Heart Rate')) ? 'text-destructive font-bold' : ''}>{alert.heartRate} bpm</span>
                  <span className="ml-2 text-muted-foreground text-xs">(Normal: {normalValues.heartRate} bpm)</span>
                </li>
              )}
              {alert.oxygenLevel !== undefined && (
                <li>
                  Oxygen Level: <span className={abnormalities.find(a => a.includes('Oxygen Level')) ? 'text-destructive font-bold' : ''}>{alert.oxygenLevel}%</span>
                  <span className="ml-2 text-muted-foreground text-xs">(Normal: {normalValues.oxygenLevel}%)</span>
                </li>
              )}
            </ul>
          </div>
          {/* Abnormalities Alert Section */}
          {abnormalities.length > 0 && (
            <div className="mb-4 p-3 bg-destructive/10 rounded">
              <h5 className="font-bold text-destructive mb-1">Abnormalities Detected:</h5>
              <ul className="list-disc ml-5 text-destructive text-sm">
                {abnormalities.map((ab, idx) => (
                  <li key={idx}>{ab}</li>
                ))}
              </ul>
            </div>
          )}
            <p className="font-medium text-foreground" data-testid="alert-title">
              {alert.title}
            </p>
            <p className="text-sm text-muted-foreground" data-testid="alert-description">
              {alert.description}
            </p>
          </div>
          
          <div className="flex space-x-3">
            <Button
              onClick={() => acknowledgeAlertMutation.mutate()}
              disabled={acknowledgeAlertMutation.isPending}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-acknowledge"
            >
              {acknowledgeAlertMutation.isPending ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              data-testid="button-dismiss"
            >
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
