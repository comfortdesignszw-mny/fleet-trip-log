import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '@/src/firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User, browserPopupRedirectResolver } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserProfile } from '@/src/types';
import { toast } from 'sonner';
import { LogIn, ShieldCheck, Phone, Key, Clock, History, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthProps {
  onAuthComplete: (user: User, profile: UserProfile) => void;
}

export default function Auth({ onAuthComplete }: AuthProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'login' | 'setup' | 'pin'>('login');
  const [loginError, setLoginError] = useState<{code: string, message: string} | null>(null);
  
  // Setup form
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  
  // PIN verification
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    // Handle redirect result
    getRedirectResult(auth).catch((error) => {
      console.error("Redirect Login Error:", error);
      setLoginError({ code: error.code, message: error.message });
      toast.error(`Redirect login failed: ${error.code}`);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            let userProfile = docSnap.data() as UserProfile;
            
            // Auto-promote designated admin if needed
            if (currentUser.email === 'comfort.designszw@gmail.com' && userProfile.role !== 'admin') {
              userProfile = { ...userProfile, role: 'admin' };
              await setDoc(doc(db, 'users', currentUser.uid), { role: 'admin' }, { merge: true });
              toast.info("Account promoted to Admin");
            }

            setProfile(userProfile);
            setStep('pin');
          } else {
            setStep('setup');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`, currentUser);
        }
      } else {
        setStep('login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async (useRedirect = false) => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      if (useRedirect) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
      }
    } catch (error: any) {
      console.error("Login Error Details:", error);
      const err = { code: error.code, message: error.message };
      setLoginError(err);

      if (error.code === 'auth/popup-blocked') {
        toast.error("Popup blocked! Please enable popups for this site.");
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error("Domain not authorized. See troubleshooting below.");
      } else if (error.code === 'auth/operation-not-allowed') {
        toast.error("Google Login is not enabled in Firebase Console.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore user cancellation
      } else {
        toast.error(`Login failed: ${error.code}`);
      }
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      toast.error("PIN must be 4 digits");
      return;
    }

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'User',
      phoneNumber,
      pin,
      role: user.email === 'comfort.designszw@gmail.com' ? 'admin' : 'driver',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...newProfile,
        createdAt: serverTimestamp()
      });

      // Send Welcome Email
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: newProfile.email,
            subject: 'Welcome to Fleet Trip Log!',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h1 style="color: #2563eb;">Welcome, ${newProfile.displayName}!</h1>
                <p>Your professional vehicle management account has been successfully created.</p>
                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold; color: #1e293b;">Security Confirmation:</p>
                  <p style="margin: 5px 0 0 0; color: #64748b;">Your 4-digit security PIN has been set. You will need this to unlock the system in future sessions.</p>
                </div>
                <p>You can now start logging trips, managing vehicle statistics, and exporting professional reports.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from Fleet Trip Log.</p>
              </div>
            `
          })
        });
      } catch (e) {
        console.error("Failed to send welcome email:", e);
      }

      setProfile(newProfile);
      setStep('pin');
      toast.success("Profile setup complete!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`, user);
    }
  };

  const handlePinVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (profile && pinInput === profile.pin) {
      onAuthComplete(user!, profile);
    } else {
      toast.error("Incorrect PIN");
      setPinInput('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-3xl" />
      
      <AnimatePresence mode="wait">
        {step === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md relative z-10"
          >
            <Card className="shadow-2xl border-primary/10 bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center space-y-4 pb-8">
                <div className="mx-auto w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mb-2 shadow-lg shadow-primary/20 rotate-3 hover:rotate-0 transition-transform duration-300">
                  <ShieldCheck className="w-12 h-12 text-white" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-4xl font-extrabold tracking-tight text-primary">Fleet Trip Log</CardTitle>
                  <CardDescription className="text-base font-medium text-gray-500">Professional Vehicle Management</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-400 font-medium">Secure Access</span>
                  </div>
                </div>
                
                <Button 
                  onClick={() => handleGoogleLogin(false)}
                  className="w-full h-14 text-lg font-bold flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                >
                  <LogIn className="w-6 h-6" />
                  Sign in with Google
                </Button>

                {loginError && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3"
                  >
                    <div className="flex items-start gap-2 text-red-800">
                      <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-bold">Login Error ({loginError.code})</p>
                        <p className="text-xs opacity-80">{loginError.message}</p>
                      </div>
                    </div>
                    
                    <div className="pt-2 space-y-2">
                      <p className="text-[10px] font-bold uppercase text-red-400 tracking-wider">Troubleshooting</p>
                      
                      {loginError.code === 'auth/unauthorized-domain' ? (
                        <div className="text-xs text-red-700 space-y-2">
                          <p>The current domain is not authorized in Firebase.</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Go to <a href="https://console.firebase.google.com/" target="_blank" className="underline font-bold">Firebase Console</a></li>
                            <li>Authentication &gt; Settings &gt; Authorized domains</li>
                            <li>Add: <code className="bg-red-100 px-1 rounded">{window.location.hostname}</code></li>
                          </ol>
                        </div>
                      ) : loginError.code === 'auth/popup-blocked' ? (
                        <p className="text-xs text-red-700">
                          Your browser blocked the login popup. Please click the lock icon in the address bar and allow popups.
                        </p>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs border-red-200 text-red-700 hover:bg-red-100"
                          onClick={() => handleGoogleLogin(true)}
                        >
                          Try Redirect Method
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}
                
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-accent" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Secure</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-accent" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Real-time</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                      <History className="w-5 h-5 text-accent" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Auditable</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'setup' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md relative z-10"
          >
            <Card className="shadow-2xl border-primary/10 bg-white/80 backdrop-blur-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-primary">Create Account</CardTitle>
                <CardDescription>Finalize your professional profile</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSetup} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold text-gray-700">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-primary/40" />
                      <Input 
                        id="phone"
                        placeholder="+1 234 567 8900"
                        className="pl-10 h-12 border-gray-200 focus:border-primary focus:ring-primary/20"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pin" className="text-sm font-semibold text-gray-700">Security PIN (4 digits)</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-3 w-4 h-4 text-primary/40" />
                      <Input 
                        id="pin"
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        className="pl-10 h-12 border-gray-200 focus:border-primary focus:ring-primary/20"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        required
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 font-medium">This PIN will be required for every login session.</p>
                  </div>
                  <Button type="submit" className="w-full h-12 bg-primary hover:bg-primary/90 font-bold text-lg shadow-lg shadow-primary/10">
                    Complete Registration
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'pin' && (
          <motion.div
            key="pin"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md relative z-10"
          >
            <Card className="shadow-2xl border-primary/10 bg-white/80 backdrop-blur-sm">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mb-4">
                  <Key className="w-6 h-6 text-accent" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary">Identity Verification</CardTitle>
                <CardDescription>Welcome back, {profile?.displayName}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePinVerify} className="space-y-8">
                  <div className="flex flex-col items-center gap-4">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-400">Enter Security PIN</Label>
                    <Input 
                      type="password"
                      maxLength={4}
                      className="w-48 text-center text-4xl tracking-[0.5em] h-20 border-2 border-primary/20 focus:border-primary focus:ring-primary/10 rounded-2xl font-mono"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Button type="submit" className="w-full h-14 bg-primary hover:bg-primary/90 font-bold text-lg shadow-lg shadow-primary/10">
                      Unlock System
                    </Button>
                    <Button 
                      type="button"
                      variant="ghost" 
                      className="w-full text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      onClick={() => auth.signOut()}
                    >
                      Not you? Switch Account
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
