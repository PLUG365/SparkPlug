import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Host from './views/Host';
import Presenter from './views/Presenter';
import Audience from './views/Audience';
import Screen from './views/Screen';
import Overlay from './views/Overlay';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/e/:eventId/host" element={<Host />} />
        <Route path="/e/:eventId/presenter" element={<Presenter />} />
        <Route path="/e/:eventId" element={<Audience />} />
        <Route path="/e/:eventId/screen" element={<Screen />} />
        <Route path="/e/:eventId/overlay" element={<Overlay />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
