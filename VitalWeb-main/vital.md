# VitalCare Patient Monitoring System

## Overview

VitalCare is a comprehensive patient monitoring system designed for healthcare professionals to track real-time vital signs and manage patient care. The application provides continuous monitoring of patient vitals (heart rate, blood pressure, temperature, SpO2), intelligent alerting for critical conditions, and a comprehensive dashboard for healthcare providers to oversee multiple patients simultaneously.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and component-based architecture
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Radix UI primitives with shadcn/ui component system for consistent, accessible design
- **Styling**: Tailwind CSS with CSS variables for theme customization and responsive design
- **State Management**: TanStack Query (React Query) for server state management with real-time data fetching
- **Forms**: React Hook Form with Zod validation for robust form handling
- **Charts**: Chart.js for real-time vital sign visualization
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework for REST API endpoints
- **Session Management**: Express sessions with PostgreSQL storage for persistent user sessions
- **Real-time Features**: Automated vital sign simulation service that generates realistic patient data
- **API Design**: RESTful endpoints with proper error handling and request/response logging


### Core Libraries


- **@tanstack/react-query**: Server state management with caching and synchronization
- **@radix-ui/***: Accessible UI primitive components for consistent user experience
- **chart.js**: Canvas-based charting library for vital sign visualizations
- **express**: Web application framework for API endpoints
- **passport**: Authentication middleware with OpenID Connect strategy

### Development Tools
- **TypeScript**: Static type checking across frontend and backend
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Vite**: Frontend build tool with hot module replacement
- **ESBuild**: Backend bundling for production deployments
