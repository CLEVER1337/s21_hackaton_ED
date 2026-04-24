import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Upload from './pages/Upload.jsx';
import Verify from './pages/Verify.jsx';
import Results from './pages/Results.jsx';
import logo from './assets/logo.svg';

export default function App() {
  const location = useLocation();

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-kzn-green text-white shadow-card">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="DocFlow" className="w-9 h-9 bg-white/10 rounded p-1" />
            <div className="leading-tight">
              <div className="text-lg font-semibold">DocFlow AI</div>
              <div className="text-xs text-white/70">
                Распознавание бухгалтерских документов
              </div>
            </div>
          </Link>
          <nav className="ml-auto flex gap-1 text-sm">
            <NavTab to="/" current={location.pathname === '/'}>
              Загрузка
            </NavTab>
            <NavTab to="/results" current={location.pathname.startsWith('/results')}>
              История
            </NavTab>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/verify/:id" element={<Verify />} />
          <Route path="/results" element={<Results />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-kzn-line bg-white/50 text-xs text-kzn-muted">
        <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between">
          <span>DocFlow AI · GigaChat</span>
          <span>Цветовая гамма kzn.ru</span>
        </div>
      </footer>
    </div>
  );
}

function NavTab({ to, current, children }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md transition ${
        current
          ? 'bg-white text-kzn-green font-medium'
          : 'text-white/80 hover:bg-white/10'
      }`}
    >
      {children}
    </Link>
  );
}
