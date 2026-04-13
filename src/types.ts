export type FuelLevel = 
  | 'Full' 
  | 'Full-' 
  | '¾+' 
  | '¾' 
  | '½+' 
  | '½' 
  | '¼+' 
  | '¼' 
  | 'Empty+' 
  | 'Empty';

export interface TripRecord {
  id: string;
  vehicleName: string;
  vehicleReg: string;
  driverName: string;
  tripType: 'Trip' | 'Hire';
  tripReason: string;
  destination: string;
  notes?: string;
  
  // Outbound
  dateOut: string; // ISO string
  timeOut: string;
  mileageOut: number;
  fuelOut: FuelLevel;
  
  // Inbound (optional until completed)
  dateIn?: string;
  timeIn?: string;
  mileageIn?: number;
  fuelIn?: FuelLevel;
  
  // Calculated
  totalMileage?: number;
  
  status: 'active' | 'completed';
  createdBy: string; // User UID
  createdByName?: string;
  completedBy?: string; // User UID
  completedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  pin: string; // 4-digit pin
  role: 'admin' | 'driver';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityId: string;
  entityType: 'trip' | 'user' | 'vehicle';
  userId: string;
  userEmail: string;
  timestamp: string;
  details: any;
}

export interface VehicleConfig {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
  year: string;
  updatedAt: string;
  updatedBy: string;
}
