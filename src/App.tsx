import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { UserProfile, TripRecord } from './types';
import Auth from './components/Auth';
import TripForm from './components/TripForm';
import TripHistory from './components/TripHistory';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { LogOut, PlusCircle, History, LayoutDashboard, User as UserIcon, Settings as SettingsIcon, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripRecord | undefined>();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [view, setView] = useState<'dashboard' | 'trip' | 'history' | 'settings'>('dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (user && profile) {
      // Listen for trips
      // Admins see all trips, drivers see their own
      const tripsCollection = collection(db, 'trips');
      let tripsQuery;

      if (profile.role === 'admin') {
        tripsQuery = query(
          tripsCollection,
          orderBy('createdAt', 'desc')
        );
      } else {
        tripsQuery = query(
          tripsCollection,
          where('createdBy', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
      }

      const unsubscribeAll = onSnapshot(tripsQuery, (snapshot) => {
        setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        const tripData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TripRecord[];
        setTrips(tripData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'trips');
      });

      // Listen for active trips
      let activeQuery;
      if (profile.role === 'admin') {
        activeQuery = query(
          tripsCollection,
          where('status', '==', 'active')
        );
      } else {
        activeQuery = query(
          tripsCollection,
          where('createdBy', '==', user.uid),
          where('status', '==', 'active')
        );
      }

      const unsubscribeActive = onSnapshot(activeQuery, (snapshot) => {
        setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        if (!snapshot.empty) {
          const trip = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as TripRecord;
          setActiveTrip(trip);
        } else {
          setActiveTrip(undefined);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'trips');
      });

      return () => {
        unsubscribeAll();
        unsubscribeActive();
      };
    }
  }, [user, profile]);

  const handleAuthComplete = (u: User, p: UserProfile) => {
    setUser(u);
    setProfile(p);
  };

  const handleSignOut = () => {
    auth.signOut();
    setUser(null);
    setProfile(null);
  };

  if (!user || !profile) {
    return (
      <ErrorBoundary>
        <Auth onAuthComplete={handleAuthComplete} />
        <Toaster position="top-center" />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pb-20 md:pb-0 md:pl-64">
        {/* Sidebar for Desktop */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed left-0 top-0 h-full z-30">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h1 className="text-xl font-bold text-primary flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6" /> Fleet Trip Log
            </h1>
            <div className="flex items-center gap-2">
              {hasPendingWrites && (
                <div className="flex items-center gap-1 text-[10px] text-orange-500 animate-pulse font-medium">
                  <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                  Syncing
                </div>
              )}
              <div title={isOnline ? "Online" : "Offline"}>
                {isOnline ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
              </div>
            </div>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <Button 
              variant={view === 'dashboard' ? 'default' : 'ghost'} 
              className="w-full justify-start gap-3"
              onClick={() => setView('dashboard')}
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Button>
            <Button 
              variant={view === 'trip' ? 'default' : 'ghost'} 
              className="w-full justify-start gap-3"
              onClick={() => setView('trip')}
            >
              <PlusCircle className="w-5 h-5" />
              {activeTrip ? 'Current Trip' : 'New Trip'}
            </Button>
            <Button 
              variant={view === 'history' ? 'default' : 'ghost'} 
              className="w-full justify-start gap-3"
              onClick={() => setView('history')}
            >
              <History className="w-5 h-5" />
              Trip History
            </Button>
            <Button 
              variant={view === 'settings' ? 'default' : 'ghost'} 
              className="w-full justify-start gap-3"
              onClick={() => setView('settings')}
            >
              <SettingsIcon className="w-5 h-5" />
              Settings
            </Button>
          </nav>
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <UserIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{profile.displayName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {profile.role === 'driver' ? 'User' : profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Mobile Navigation */}
        <div className="md:hidden fixed top-4 right-4 z-50 flex items-center gap-2">
          {hasPendingWrites && (
            <div className="bg-orange-500/10 p-2 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-orange-600 font-bold uppercase">Syncing</span>
            </div>
          )}
          <div className={cn(
            "p-2 rounded-full shadow-lg backdrop-blur-sm",
            isOnline ? "bg-green-500/10" : "bg-red-500/10"
          )}>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
          </div>
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around p-2 z-40 shadow-lg">
          <Button 
            variant="ghost" 
            className={`flex-col h-auto py-2 gap-1 ${view === 'dashboard' ? 'text-primary' : 'text-gray-500'}`}
            onClick={() => setView('dashboard')}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px]">Stats</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`flex-col h-auto py-2 gap-1 ${view === 'trip' ? 'text-primary' : 'text-gray-500'}`}
            onClick={() => setView('trip')}
          >
            <PlusCircle className="w-6 h-6" />
            <span className="text-[10px]">Trip</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`flex-col h-auto py-2 gap-1 ${view === 'history' ? 'text-primary' : 'text-gray-500'}`}
            onClick={() => setView('history')}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px]">History</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`flex-col h-auto py-2 gap-1 ${view === 'settings' ? 'text-primary' : 'text-gray-500'}`}
            onClick={() => setView('settings')}
          >
            <SettingsIcon className="w-6 h-6" />
            <span className="text-[10px]">Settings</span>
          </Button>
        </nav>

        {/* Main Content */}
        <main className="p-4 md:p-8">
          <AnimatePresence mode="wait">
            {view === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <Dashboard trips={trips} />
              </motion.div>
            ) : view === 'trip' ? (
              <motion.div
                key="trip"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <TripForm 
                  userProfile={profile} 
                  activeTrip={activeTrip} 
                  onComplete={() => setView('history')} 
                />
              </motion.div>
            ) : view === 'history' ? (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <TripHistory 
                  userProfile={profile} 
                  onEditTrip={(trip) => {
                    setActiveTrip(trip);
                    setView('trip');
                  }} 
                />
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Settings userProfile={profile} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
}
