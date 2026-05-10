import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  // Fail loudly during dev, surface a helpful message in prod
  console.error('Missing VITE_CLERK_PUBLISHABLE_KEY (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) at build time')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: '#00e5ff',
          colorBackground: '#0d1525',
          colorInputBackground: 'rgba(13,21,37,0.6)',
          colorInputText: '#e8f0fe',
          colorText: '#e8f0fe',
          colorTextSecondary: '#5a7090',
          colorNeutral: '#e8f0fe',
          borderRadius: '12px',
          fontFamily: 'Sora, sans-serif',
        },
      }}
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
