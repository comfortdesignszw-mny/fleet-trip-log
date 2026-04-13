import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TripRecord, FuelLevel, UserProfile, VehicleConfig } from '@/src/types';
import { toast } from 'sonner';
import { Car, MapPin, Fuel, Clock, Calendar as CalendarIcon, Save, Info, Droplets } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/src/lib/utils';

interface TripFormProps {
  userProfile: UserProfile;
  activeTrip?: TripRecord;
  onComplete: () => void;
}

const FUEL_LEVELS: FuelLevel[] = [
  'Full', 'Full-', '¾+', '¾', '½+', '½', '¼+', '¼', 'Empty+', 'Empty'
];

export default function TripForm({ userProfile, activeTrip, onComplete }: TripFormProps) {
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [driverName, setDriverName] = useState('');
  const [tripType, setTripType] = useState<'Trip' | 'Hire'>('Trip');
  const [tripReason, setTripReason] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [dateOut, setDateOut] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeOut, setTimeOut] = useState(format(new Date(), 'HH:mm'));
  const [mileageOut, setMileageOut] = useState<number>(0);
  const [fuelOut, setFuelOut] = useState<FuelLevel>('Full');
  
  // Return state
  const [dateIn, setDateIn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [timeIn, setTimeIn] = useState(format(new Date(), 'HH:mm'));
  const [mileageIn, setMileageIn] = useState<number>(0);
  const [fuelIn, setFuelIn] = useState<FuelLevel>('Full');

  useEffect(() => {
    const fetchVehicle = async () => {
      if (!activeTrip) {
        try {
          const docSnap = await getDoc(doc(db, 'settings', 'vehicle'));
          if (docSnap.exists()) {
            const data = docSnap.data() as VehicleConfig;
            setVehicleName(`${data.make} ${data.model}`);
            setVehicleReg(data.plateNumber);
          }
        } catch (e) {
          console.error("Error fetching vehicle:", e);
        }
      }
    };
    fetchVehicle();
  }, [activeTrip]);

  useEffect(() => {
    if (activeTrip) {
      setVehicleName(activeTrip.vehicleName || '');
      setVehicleReg(activeTrip.vehicleReg || '');
      setDriverName(activeTrip.driverName);
      setTripType(activeTrip.tripType);
      setTripReason(activeTrip.tripReason);
      setDestination(activeTrip.destination || '');
      setNotes(activeTrip.notes || '');
      setMileageOut(activeTrip.mileageOut);
      setFuelOut(activeTrip.fuelOut);
      setMileageIn(activeTrip.mileageOut); // Default to out mileage
      setDateOut(activeTrip.dateOut);
      setTimeOut(activeTrip.timeOut);
    }
  }, [activeTrip]);

  const handleStartTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const now = new Date();
    if (!userProfile?.uid) {
      toast.error("User profile not loaded. Please refresh.");
      setLoading(false);
      return;
    }
    const newTrip: Partial<TripRecord> = {
      vehicleName,
      vehicleReg,
      driverName,
      tripType,
      tripReason,
      destination,
      notes,
      dateOut,
      timeOut,
      mileageOut,
      fuelOut,
      status: 'active',
      createdBy: userProfile.uid,
      createdByName: userProfile.displayName,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, 'trips'), {
        ...newTrip,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'TRIP_START',
        entityId: docRef.id,
        entityType: 'trip',
        userId: userProfile.uid,
        userEmail: userProfile.email,
        timestamp: serverTimestamp(),
        details: { mileageOut, fuelOut }
      });

      toast.success(navigator.onLine ? "Trip started successfully!" : "Trip saved locally! It will sync when you are online.");
      onComplete();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trips');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (mileageIn < activeTrip.mileageOut) {
      toast.error("Mileage In cannot be less than Mileage Out");
      return;
    }

    setLoading(true);
    const now = new Date();
    const totalMileage = mileageIn - activeTrip.mileageOut;

    try {
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        dateIn,
        timeIn,
        mileageIn,
        fuelIn,
        totalMileage,
        status: 'completed',
        completedBy: userProfile.uid,
        completedByName: userProfile.displayName,
        updatedAt: serverTimestamp()
      });

      // Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'TRIP_COMPLETE',
        entityId: activeTrip.id,
        entityType: 'trip',
        userId: userProfile.uid,
        userEmail: userProfile.email,
        timestamp: serverTimestamp(),
        details: { mileageIn, fuelIn, totalMileage }
      });

      toast.success(navigator.onLine ? "Trip completed successfully!" : "Trip completion saved locally! It will sync when you are online.");

      // Send Trip Completion Email (only if online)
      if (navigator.onLine) {
        try {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: userProfile.email,
              subject: `Trip Completed: ${activeTrip.tripReason}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                  <h2 style="color: #16a34a;">Trip Successfully Completed</h2>
                  <p>Hello ${userProfile.displayName},</p>
                  <p>The trip you created has been finalized. Here are the details:</p>
                  <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #dcfce7;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 5px 0; color: #166534; font-weight: bold;">Driver:</td>
                        <td style="padding: 5px 0; color: #14532d;">${activeTrip.driverName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #166534; font-weight: bold;">${activeTrip.tripType === 'Hire' ? 'Client Name' : 'Reason'}:</td>
                        <td style="padding: 5px 0; color: #14532d;">${activeTrip.tripReason}</td>
                      </tr>
                      ${activeTrip.tripType === 'Hire' ? `
                      <tr>
                        <td style="padding: 5px 0; color: #166534; font-weight: bold;">Number of Days:</td>
                        <td style="padding: 5px 0; color: #14532d;">${activeTrip.destination}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 5px 0; color: #166534; font-weight: bold;">Total Distance:</td>
                        <td style="padding: 5px 0; color: #14532d; font-size: 18px; font-weight: bold;">${totalMileage} km</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #166534; font-weight: bold;">Completed By:</td>
                        <td style="padding: 5px 0; color: #14532d;">${userProfile.displayName}</td>
                      </tr>
                    </table>
                  </div>
                  <p>The record is now available in your Trip History for export and auditing.</p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8;">Fleet Trip Log - Professional Fleet Management</p>
                </div>
              `
            })
          });
        } catch (e) {
          console.error("Failed to send trip completion email:", e);
        }
      }

      onComplete();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trips/${activeTrip.id}`);
    } finally {
      setLoading(false);
    }
  };

  const FuelSelector = ({ value, onChange, label }: { value: FuelLevel, onChange: (v: FuelLevel) => void, label: string }) => {
    const getLevelPercentage = (level: FuelLevel) => {
      switch (level) {
        case 'Full': return 100;
        case 'Full-': return 90;
        case '¾+': return 80;
        case '¾': return 75;
        case '½+': return 60;
        case '½': return 50;
        case '¼+': return 35;
        case '¼': return 25;
        case 'Empty+': return 10;
        case 'Empty': return 0;
        default: return 0;
      }
    };

    const percentage = getLevelPercentage(value);
    const colorClass = percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-500';

    return (
      <div className="space-y-3">
        <div className="flex justify-between items-end">
          <Label className="text-sm font-medium text-gray-700">{label}</Label>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full text-white", colorClass)}>
            {value}
          </span>
        </div>
        
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200 shadow-inner">
          <div 
            className={cn("absolute top-0 left-0 h-full transition-all duration-500 ease-out", colorClass)}
            style={{ width: `${percentage}%` }}
          />
          {/* Gauge Markers */}
          <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
            {[0, 25, 50, 75, 100].map((mark) => (
              <div key={mark} className="h-full w-px bg-black/10" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {FUEL_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              className={cn(
                "text-[10px] py-1.5 rounded border transition-all flex flex-col items-center justify-center gap-0.5",
                value === level 
                  ? "bg-primary text-white border-primary shadow-sm" 
                  : "bg-white text-gray-600 border-gray-200 hover:border-primary/50 hover:bg-primary/5"
              )}
            >
              <Droplets className={cn("w-3 h-3", value === level ? "text-white" : "text-primary/60")} />
              <span className="font-medium truncate w-full px-0.5">{level}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card className="shadow-lg border-none">
        <CardHeader className="bg-primary/5 rounded-t-xl border-b border-primary/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle>{activeTrip ? 'Complete Trip' : 'Start New Trip'}</CardTitle>
              <CardDescription>
                {activeTrip ? 'Recording return details' : 'Enter departure details for the vehicle'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={activeTrip ? handleCompleteTrip : handleStartTrip} className="space-y-6">
            {!activeTrip && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="vehicleName">Vehicle Name</Label>
                  <Input 
                    id="vehicleName"
                    placeholder="e.g. Toyota Hilux"
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicleReg">Vehicle Reg Number</Label>
                  <Input 
                    id="vehicleReg"
                    placeholder="e.g. ABC-1234"
                    value={vehicleReg}
                    onChange={(e) => setVehicleReg(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driverName">Driver Name</Label>
                  <Input 
                    id="driverName"
                    placeholder="Enter driver's full name"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tripType">Trip Type</Label>
                  <Select value={tripType} onValueChange={(v: any) => setTripType(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Trip">Trip / Errands</SelectItem>
                      <SelectItem value="Hire">Hire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="reason">
                    {tripType === 'Hire' ? 'Client Name' : 'Trip Reason'}
                  </Label>
                  <Input 
                    id="reason"
                    placeholder={tripType === 'Hire' ? 'Enter client name' : 'e.g. Client meeting, Delivery'}
                    value={tripReason}
                    onChange={(e) => setTripReason(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">
                    {tripType === 'Hire' ? 'Number of Days' : 'Destination'}
                  </Label>
                  <Input 
                    id="destination"
                    placeholder={tripType === 'Hire' ? 'e.g. 3 days' : 'e.g. Downtown Office'}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOut">Departure Date</Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400 z-10" />
                    <Input 
                      id="dateOut"
                      type="date"
                      className="pl-10"
                      value={dateOut}
                      onChange={(e) => setDateOut(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeOut">Departure Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400 z-10" />
                    <Input 
                      id="timeOut"
                      type="time"
                      className="pl-10"
                      value={timeOut}
                      onChange={(e) => setTimeOut(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Input 
                    id="notes"
                    placeholder="Any additional details..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {activeTrip && (
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" /> Trip Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm text-blue-800">
                    <div><strong>Vehicle:</strong> {activeTrip.vehicleName} ({activeTrip.vehicleReg})</div>
                    <div><strong>Driver:</strong> {activeTrip.driverName}</div>
                    <div><strong>Departure:</strong> {activeTrip.dateOut} {activeTrip.timeOut}</div>
                    <div><strong>Mileage Out:</strong> {activeTrip.mileageOut} km</div>
                    <div><strong>{activeTrip.tripType === 'Hire' ? 'Client Name' : 'Reason'}:</strong> {activeTrip.tripReason}</div>
                    <div><strong>{activeTrip.tripType === 'Hire' ? 'Number of Days' : 'Destination'}:</strong> {activeTrip.destination}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="dateIn">Return Date</Label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400 z-10" />
                      <Input 
                        id="dateIn"
                        type="date"
                        className="pl-10"
                        value={dateIn}
                        onChange={(e) => setDateIn(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeIn">Return Time</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400 z-10" />
                      <Input 
                        id="timeIn"
                        type="time"
                        className="pl-10"
                        value={timeIn}
                        onChange={(e) => setTimeIn(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label htmlFor="mileage">
                  {activeTrip ? 'Mileage In (km)' : 'Mileage Out (km)'}
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input 
                    id="mileage"
                    type="number"
                    className="pl-10"
                    value={activeTrip ? mileageIn : mileageOut}
                    onChange={(e) => activeTrip ? setMileageIn(Number(e.target.value)) : setMileageOut(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              
              <FuelSelector 
                label={activeTrip ? 'Fuel Level In' : 'Fuel Level Out'}
                value={activeTrip ? fuelIn : fuelOut}
                onChange={activeTrip ? setFuelIn : setFuelOut}
              />
            </div>

            {activeTrip && mileageIn > activeTrip.mileageOut && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-100 flex justify-between items-center">
                <span className="text-green-800 font-medium">Total Trip Distance:</span>
                <span className="text-2xl font-bold text-green-900">{mileageIn - activeTrip.mileageOut} km</span>
              </div>
            )}

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    {activeTrip ? 'Complete Trip & Save' : 'Start Trip'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
