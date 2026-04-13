import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '@/src/firebase';
import { doc, collection, query, where, getDocs, writeBatch, updateDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { UserProfile } from '@/src/types';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, ShieldAlert, User, Save, Users, ShieldCheck, Shield } from 'lucide-react';

interface SettingsProps {
  userProfile: UserProfile;
}

export default function Settings({ userProfile }: SettingsProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Profile state
  const [displayName, setDisplayName] = useState(userProfile.displayName);
  const [phoneNumber, setPhoneNumber] = useState(userProfile.phoneNumber);
  const [pin, setPin] = useState(userProfile.pin);

  useEffect(() => {
    if (userProfile.role === 'admin') {
      setLoadingUsers(true);
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userData = snapshot.docs.map(doc => ({
          ...doc.data()
        })) as UserProfile[];
        setUsers(userData);
        setLoadingUsers(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
        setLoadingUsers(false);
      });
      return () => unsubscribe();
    }
  }, [userProfile.role]);

  const handleToggleRole = async (targetUser: UserProfile) => {
    const newRole = targetUser.role === 'admin' ? 'driver' : 'admin';
    
    // Prevent self-demotion if only one admin (optional but safe)
    if (targetUser.uid === userProfile.uid && userProfile.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        toast.error("Cannot demote the only administrator.");
        return;
      }
    }

    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        role: newRole,
        updatedAt: serverTimestamp()
      });
      toast.success(`User ${targetUser.displayName} ${newRole === 'admin' ? 'promoted to Admin' : 'demoted to User'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      if (pin.length !== 4 || !/^\d+$/.test(pin)) {
        toast.error("PIN must be 4 digits");
        return;
      }

      await updateDoc(doc(db, 'users', userProfile.uid), {
        displayName,
        phoneNumber,
        pin,
        updatedAt: serverTimestamp()
      });
      toast.success("Profile updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userProfile.uid}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete user profile
      batch.delete(doc(db, 'users', user.uid));

      // 2. Find and delete user's trips (optional, but good for privacy)
      const tripsQuery = query(collection(db, 'trips'), where('createdBy', '==', user.uid));
      const tripsSnapshot = await getDocs(tripsQuery);
      tripsSnapshot.forEach((tripDoc) => {
        batch.delete(tripDoc.ref);
      });

      // Commit Firestore deletions
      await batch.commit();

      // 3. Delete Auth user
      await deleteUser(user);
      
      toast.success("Account deleted successfully");
      window.location.reload();
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        toast.error("Please log out and log back in to verify your identity before deleting your account.");
      } else {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card className="shadow-sm border-none bg-white">
        <CardHeader className="bg-primary/5 rounded-t-xl border-b border-primary/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>User Profile</CardTitle>
              <CardDescription>Update your personal information and security PIN</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input 
                  id="displayName"
                  placeholder="Your Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email"
                  value={userProfile.email}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input 
                  id="phone"
                  placeholder="+1 234 567 8900"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">Security PIN (4 digits)</Label>
                <Input 
                  id="pin"
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full gap-2" disabled={isSavingProfile}>
              <Save className="w-4 h-4" />
              {isSavingProfile ? 'Saving...' : 'Update Profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {userProfile.role === 'admin' && (
        <Card className="shadow-sm border-none bg-white">
          <CardHeader className="bg-blue-50/50 rounded-t-xl border-b border-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-blue-900">User Management</CardTitle>
                <CardDescription className="text-blue-700">View and manage system users</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {loadingUsers ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((u) => (
                  <div key={u.uid} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{u.displayName}</p>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] h-4 px-1">
                            {u.role === 'admin' ? 'Admin' : 'User'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                    
                    {u.uid !== userProfile.uid && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 h-8"
                        onClick={() => handleToggleRole(u)}
                      >
                        {u.role === 'admin' ? (
                          <>
                            <Shield className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-xs">Demote</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs">Promote</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-red-100 shadow-sm">
        <CardHeader className="bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-red-900">Danger Zone</CardTitle>
              <CardDescription className="text-red-700">Irreversible account actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-semibold text-gray-900">Delete Account</h4>
              <p className="text-sm text-gray-500">
                Permanently remove your profile and all associated trip data. This action cannot be undone.
              </p>
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    Confirm Deletion
                  </DialogTitle>
                  <DialogDescription className="pt-2">
                    Are you absolutely sure you want to delete your account? This will permanently remove your data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-amber-800 text-sm">
                  <strong>Warning:</strong> You may be required to re-authenticate (log out and back in) if you haven't signed in recently.
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => {}}>Cancel</Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Yes, Delete My Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
