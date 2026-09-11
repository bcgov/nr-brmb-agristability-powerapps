import { BrowserRouter } from 'react-router-dom';

import { BenefitApp } from './app/BenefitApp';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <BenefitApp />
    </BrowserRouter>
  );
}

export default App;
