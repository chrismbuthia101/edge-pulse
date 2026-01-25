# EdgePulse Dashboard (Frontend)

The EdgePulse dashboard is a Next.js web application for monitoring and analyzing alerts from edge devices.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Access the dashboard at `http://localhost:3000`

## Build

```bash
npm run build
npm start
```

## Project Structure

```
frontend/
├── src/
│   ├── app/            # Next.js app router
│   │   ├── page.tsx    # Main dashboard
│   │   ├── alerts/      # Alerts page
│   │   └── devices/    # Devices page
│   ├── components/      # React components
│   ├── lib/            # Utilities
│   └── types/          # TypeScript types
└── public/             # Static assets
```

## Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
```
