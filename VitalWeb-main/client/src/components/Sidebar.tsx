import { Button } from "@/components/ui/button";
import { BarChart3, Users, Activity, Bell, FileText, PlusCircle } from "lucide-react";
import { useLocation } from "wouter";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [, navigate] = useLocation();
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'add-patient', label: 'Add Patient', icon: PlusCircle },
    { id: 'upload-reports', label: 'Upload Reports', icon: FileText },
    { id: 'medi', label: 'Medicines', icon: Activity },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border min-h-screen">
      <nav className="p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              className={`w-full justify-start space-x-3 ${
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
              onClick={() => {
                if (item.id === 'overview') {
                  navigate('/dashboard');
                  onTabChange('overview');
                } else if (item.id === 'patients') {
                  navigate('/dashboard');
                  onTabChange('patients');
                } else if (item.id === 'alerts') {
                  navigate('/dashboard');
                  onTabChange('alerts');
                } else if (item.id === 'add-patient') {
                  navigate('/dashboard');
                  onTabChange('add-patient');
                } else if (item.id === 'upload-reports') {
                  // Open dashboard and select the upload-reports tab
                  navigate('/dashboard?tab=upload-reports');
                  onTabChange('upload-reports');
                } else if (item.id === 'medi') {
                  // Open dashboard and select the medicines tab
                  navigate('/dashboard?tab=medi');
                  onTabChange('medi');
                }
              }}
              data-testid={`nav-${item.id}`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Button>
          );
        })}
       
      </nav>
    </aside>
  );
}
