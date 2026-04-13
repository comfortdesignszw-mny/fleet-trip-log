import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TripRecord, UserProfile, VehicleConfig } from '@/src/types';
import { FileText, Download, Filter, History, Calendar as CalendarIcon, Search, Edit2, Share2, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getDoc, doc } from 'firebase/firestore';

interface TripHistoryProps {
  userProfile: UserProfile;
  onEditTrip: (trip: TripRecord) => void;
}

export default function TripHistory({ userProfile, onEditTrip }: TripHistoryProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [vehicle, setVehicle] = useState<VehicleConfig | null>(null);

  useEffect(() => {
    const fetchVehicle = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'vehicle'));
        if (docSnap.exists()) {
          setVehicle(docSnap.data() as VehicleConfig);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchVehicle();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'trips'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TripRecord[];
      setTrips(tripData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => unsubscribe();
  }, []);

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trip.tripReason.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    const tripDate = new Date(trip.createdAt instanceof Timestamp ? trip.createdAt.toDate() : trip.createdAt);
    const now = new Date();

    if (filter === 'daily') {
      return tripDate >= startOfDay(now) && tripDate <= endOfDay(now);
    }
    if (filter === 'weekly') {
      return tripDate >= startOfWeek(now) && tripDate <= endOfWeek(now);
    }
    if (filter === 'monthly') {
      return tripDate >= startOfMonth(now) && tripDate <= endOfMonth(now);
    }
    return true;
  });

  const generatePDF = (data: TripRecord[], title: string) => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Fleet Trip Log - Vehicle Statistics', 14, 22);
    
    if (vehicle) {
      doc.setFontSize(10);
      doc.text(`Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`, 14, 30);
      doc.setFontSize(12);
      doc.text(`Report: ${title}`, 14, 38);
      doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 46);
    } else {
      doc.setFontSize(12);
      doc.text(`Report: ${title}`, 14, 30);
      doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 38);
    }

    const tableData = data.map(t => [
      t.dateOut,
      t.tripType,
      `${t.vehicleName || 'N/A'} (${t.vehicleReg || 'N/A'})`,
      t.driverName,
      t.tripReason,
      t.destination || '-',
      t.mileageOut,
      t.mileageIn || '-',
      t.totalMileage || '-',
      t.status
    ]);

    autoTable(doc, {
      startY: vehicle ? 52 : 45,
      head: [['Date', 'Type', 'Vehicle', 'Driver', 'Reason/Client', 'Dest/Days', 'Out', 'In', 'Total', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 6 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 12 },
        2: { cellWidth: 20 },
        3: { cellWidth: 15 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
        6: { cellWidth: 12 },
        7: { cellWidth: 12 },
        8: { cellWidth: 12 },
        9: { cellWidth: 12 }
      }
    });

    doc.save(`triplog-report-${filter}-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const generateCSV = (data: TripRecord[]) => {
    const headers = ['Date', 'Time Out', 'Type', 'Vehicle', 'Reg', 'Driver', 'Reason/Client', 'Dest/Days', 'Mileage Out', 'Mileage In', 'Total Mileage', 'Status'];
    
    let csvContent = '';
    if (vehicle) {
      csvContent += `Vehicle,${vehicle.make} ${vehicle.model},Plate,${vehicle.plateNumber}\n\n`;
    }
    
    const rows = data.map(t => [
      t.dateOut,
      t.timeOut,
      t.tripType,
      t.vehicleName || 'N/A',
      t.vehicleReg || 'N/A',
      t.driverName,
      t.tripReason,
      t.destination || '',
      t.mileageOut,
      t.mileageIn || '',
      t.totalMileage || '',
      t.status
    ]);

    csvContent += [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `triplog-export-${filter}-${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = (trip: TripRecord) => {
    const text = `Trip Record:
Driver: ${trip.driverName}
Reason: ${trip.tripReason}
Destination: ${trip.destination}
Date: ${trip.dateOut}
Mileage: ${trip.mileageOut} to ${trip.mileageIn || 'Active'}
Status: ${trip.status}`;

    if (navigator.share) {
      navigator.share({
        title: 'Trip Record',
        text: text,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Trip details copied to clipboard!");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6 text-primary" /> Trip History
          </h2>
          <p className="text-gray-500">Manage and export vehicle trip records</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2"
            onClick={() => generateCSV(filteredTrips)}
          >
            <FileText className="w-4 h-4" /> Export CSV
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 md:flex-none gap-2"
            onClick={() => generatePDF(filteredTrips, `${filter.toUpperCase()} Report`)}
          >
            <Download className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-none bg-white">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search by driver or reason..." 
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Tabs value={filter} onValueChange={(v: any) => setFilter(v)} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredTrips.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No trip records found for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Mileage Out</TableHead>
                    <TableHead className="text-right">Mileage In</TableHead>
                    <TableHead className="text-right">Total (km)</TableHead>
                    <TableHead>Audit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{trip.dateOut}</span>
                          <span className="text-xs text-gray-400">{trip.timeOut}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold">{trip.vehicleName || 'N/A'}</span>
                          <span className="text-[10px] text-gray-400">{trip.vehicleReg || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{trip.driverName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            {trip.tripType === 'Hire' && <span className="text-[10px] font-bold text-primary uppercase">Hire:</span>}
                            <span>{trip.tripReason}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 italic">
                            {trip.tripType === 'Hire' ? `Duration: ${trip.destination}` : trip.destination}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{trip.mileageOut}</TableCell>
                      <TableCell className="text-right">{trip.mileageIn || '-'}</TableCell>
                      <TableCell className="text-right font-bold">
                        {trip.totalMileage !== undefined ? `${trip.totalMileage}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-gray-500">
                            <UserIcon className="w-3 h-3" /> {trip.createdByName || 'System'}
                          </div>
                          {trip.completedByName && (
                            <div className="flex items-center gap-1 text-[10px] text-green-600">
                              <CheckCircle2 className="w-3 h-3" /> {trip.completedByName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={trip.status === 'active' ? 'default' : 'secondary'}>
                          {trip.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {trip.status === 'active' ? (
                            <Button 
                              size="sm" 
                              variant="default"
                              className="h-8"
                              onClick={() => onEditTrip(trip)}
                            >
                              Complete
                            </Button>
                          ) : (
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => onEditTrip(trip)}
                              title="Edit Trip"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            size="icon" 
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => generatePDF([trip], `Trip Record - ${trip.id}`)}
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleShare(trip)}
                            title="Share Trip"
                          >
                            <Share2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
