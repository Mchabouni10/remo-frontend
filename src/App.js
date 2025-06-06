// src/App.jsx
import './App.css';
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { getUser } from './utilities/users-service';
import Navbar from './components/Navbar/Navbar';
import AuthPage from './components/AuthPage/AuthPage';
import UserLogOut from './components/UserLogOut/UserLogOut';
import HomePage from './components/HomePage/HomePage';
import CustomersList from './components/CustomersList/CustomersList';
import CustomerProjects from './components/CustomerProjects/CustomerProjects';
import CustomerProjectsCards from './components/CustomerProjects/CustomerProjectCard';
import EstimateSummaryPage from './components/EstimateSummary/EstimateSummary';
import FinanceDashboard from './components/FinanceDashboard/FinanceDashboard';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode === 'true' || (!savedMode && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      htmlElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prevMode) => !prevMode);
  };

  return (
    <div className="App">
      <div className="backgroundEffects"></div>
      {user ? (
        <>
          <Navbar
            user={user}
            setUser={setUser}
            toggleDarkMode={toggleDarkMode}
            isDarkMode={isDarkMode}
          />
          <main className="mainContent">
            <Routes>
              <Route path="/home/customer" element={<HomePage />} />
              <Route path="/home/customer/:id" element={<HomePage />} />
              <Route path="/home/edit/:id" element={<HomePage />} />
              <Route path="/home/customers" element={<CustomersList />} />
              <Route path="/home/customer-projects" element={<CustomerProjects />} />
              <Route path="/home/customer-projects-cards" element={<CustomerProjectsCards />} />
              <Route path="/home/estimate/:id" element={<EstimateSummaryPage />} />
              <Route path="/home/new-customer-project" element={<HomePage />} />
              <Route path="/home/finance" element={<FinanceDashboard />} />
              <Route path="/logout" element={<UserLogOut user={user} setUser={setUser} />} />
              <Route path="/" element={<Navigate to="/home/customers" />} />
            </Routes>
          </main>
        </>
      ) : (
        <AuthPage
          setUser={setUser}
          toggleDarkMode={toggleDarkMode}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}