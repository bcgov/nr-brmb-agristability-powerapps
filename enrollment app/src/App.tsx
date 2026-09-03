import { HashRouter } from 'react-router-dom';

import { EnrollmentApp } from './app/EnrollmentApp';
import { RoleProvider } from './context/RoleContext';

function App() {
  return (
    <HashRouter>
      <RoleProvider>
        <EnrollmentApp />
      </RoleProvider>
    </HashRouter>
  );
}

export default App;
