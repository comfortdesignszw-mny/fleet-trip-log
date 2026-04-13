import React, { useMemo } from 'react';
import { TripRecord } from '@/src/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  TrendingUp, 
  Car, 
  Calendar, 
  Milestone, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Clock
} from 'lucide-react';
import { 
  format, 
  startOfDay, 
  subDays, 
  isWithinInterval, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  parseISO
} from 'date-fns';

interface DashboardProps {
  trips: TripRecord[];
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444'];

export default function Dashboard({ trips }: DashboardProps) {
  const stats = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const completedTrips = trips.filter(t => t.status === 'completed');

    const totalMileage = completedTrips.reduce((acc, t) => acc + (t.totalMileage || 0), 0);
    
    const todayMileage = completedTrips
      .filter(t => isWithinInterval(parseISO(t.dateOut), { start: today, end: now }))
      .reduce((acc, t) => acc + (t.totalMileage || 0), 0);

    const weekMileage = completedTrips
      .filter(t => isWithinInterval(parseISO(t.dateOut), { start: weekStart, end: now }))
      .reduce((acc, t) => acc + (t.totalMileage || 0), 0);

    const monthMileage = completedTrips
      .filter(t => isWithinInterval(parseISO(t.dateOut), { start: monthStart, end: now }))
      .reduce((acc, t) => acc + (t.totalMileage || 0), 0);

    // Chart Data: Last 14 days
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const mileage = completedTrips
        .filter(t => t.dateOut === dateStr)
        .reduce((acc, t) => acc + (t.totalMileage || 0), 0);
      
      return {
        date: format(date, 'MMM dd'),
        mileage
      };
    }).reverse();

    // Trip Type Distribution
    const tripTypes = [
      { name: 'Trip', value: trips.filter(t => t.tripType === 'Trip').length },
      { name: 'Hire', value: trips.filter(t => t.tripType === 'Hire').length }
    ];

    return {
      totalMileage,
      todayMileage,
      weekMileage,
      monthMileage,
      last14Days,
      tripTypes,
      totalTrips: trips.length,
      activeTrips: trips.filter(t => t.status === 'active').length
    };
  }, [trips]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-primary text-white">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-primary-foreground/80 text-sm font-medium">Total Mileage</p>
                <h3 className="text-3xl font-bold mt-1">{stats.totalMileage} <span className="text-sm font-normal">km</span></h3>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <Milestone className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs text-primary-foreground/60">
              <Activity className="w-3 h-3" />
              <span>All-time recorded distance</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">This Month</p>
                <h3 className="text-3xl font-bold mt-1 text-gray-900">{stats.monthMileage} <span className="text-sm font-normal text-gray-400">km</span></h3>
              </div>
              <div className="p-2 bg-blue-50 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs text-green-600">
              <ArrowUpRight className="w-3 h-3" />
              <span>Current billing period</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">Active Trips</p>
                <h3 className="text-3xl font-bold mt-1 text-gray-900">{stats.activeTrips}</h3>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg">
                <Car className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs text-orange-600">
              <TrendingUp className="w-3 h-3" />
              <span>Vehicles currently out</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm font-medium">Today's Distance</p>
                <h3 className="text-3xl font-bold mt-1 text-gray-900">{stats.todayMileage} <span className="text-sm font-normal text-gray-400">km</span></h3>
              </div>
              <div className="p-2 bg-purple-50 rounded-lg">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs text-gray-400">
              <span>Recorded since midnight</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Mileage Trends</CardTitle>
            <CardDescription>Daily distance recorded over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.last14Days}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    unit="km"
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar 
                    dataKey="mileage" 
                    fill="#2563eb" 
                    radius={[4, 4, 0, 0]} 
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Trip Distribution</CardTitle>
            <CardDescription>Ratio of standard trips vs hires</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.tripTypes}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.tripTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              {stats.tripTypes.map((type, i) => (
                <div key={type.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-sm font-medium text-gray-600">{type.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
