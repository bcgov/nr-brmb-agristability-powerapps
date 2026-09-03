import { Navigate, Route, Routes } from 'react-router-dom';

import { useRole, type AppRole } from '../context/RoleContext';
import { DeadlineReminderPage } from '../pages/DeadlineReminderPage';
import { EnrolmentCalculationPage } from '../pages/EnrolmentCalculationPage';
import { EnrolmentDetailsPage } from '../pages/EnrolmentDetailsPage';
import { EnrolmentHistoryPage } from '../pages/EnrolmentHistoryPage';
import { DashboardHomePage } from '../pages/DashboardHomePage';
import { SupervisorApprovalPage } from '../pages/SupervisorApprovalPage';
import { CALCULATION_ROLES, SUPERVISOR_APPROVAL_ROLES } from './roleRules';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: AppRole[] }) {
  const { activeRole } = useRole();
  if (!allowedRoles.includes(activeRole)) {
    return <Navigate to="/dashboard-home" replace />;
  }
  return <>{children}</>;
}

export function EnrollmentRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard-home" replace />} />
      <Route path="/dashboard-home" element={<DashboardHomePage />} />
      <Route path="/enrolment/:enrolmentId" element={<EnrolmentDetailsPage />} />
      <Route path="/enrolment/:source/:enrolmentId" element={<EnrolmentDetailsPage />} />
      <Route
        path="/supervisor-approval"
        element={(
          <ProtectedRoute allowedRoles={SUPERVISOR_APPROVAL_ROLES}>
            <SupervisorApprovalPage />
          </ProtectedRoute>
        )}
      />
      <Route path="/deadline-reminders" element={<DeadlineReminderPage />} />
      <Route
        path="/calculation/:enrolmentId"
        element={(
          <ProtectedRoute allowedRoles={CALCULATION_ROLES}>
            <EnrolmentCalculationPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/calculation/:source/:enrolmentId"
        element={(
          <ProtectedRoute allowedRoles={CALCULATION_ROLES}>
            <EnrolmentCalculationPage />
          </ProtectedRoute>
        )}
      />
      <Route path="/calculation" element={<Navigate to="/dashboard-home" replace />} />
      <Route path="/history/:historyId" element={<EnrolmentHistoryPage />} />
      <Route path="/history/:enrolmentId/:historyId" element={<EnrolmentHistoryPage />} />
      <Route path="*" element={<Navigate to="/dashboard-home" replace />} />
    </Routes>
  );
}
