import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

import AddPatientPage from "@/pages/add-patient";
import ProfilePage from "@/pages/profile";
import LoginPage from "@/pages/doc-login";
import PatientLoginPage from "@/pages/patient-login";
import PatientDashboardPage from "@/pages/patient-dashboard";
import UploadReportsPage from "@/pages/upload-reports";
import ReportPage from "@/pages/report";
import MedicineReminderPage from "./pages/medi";
import PatientMedPage from "./pages/patient-med";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
  <Route path="/doc-login" component={LoginPage} />
    <Route path="/patient-login" component={PatientLoginPage} />
      <Route path="/dashboard" component={Dashboard} />
  <Route path="/dashboard/patient" component={PatientDashboardPage} />
      
      <Route path="/medi" component={MedicineReminderPage} />
  <Route path="/patient-med" component={PatientMedPage} />
      <Route path="/add-patient" component={AddPatientPage} />
    <Route path="/upload-reports" component={UploadReportsPage} />
    <Route path="/report" component={ReportPage} />
  <Route path="/profile" component={ProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
