import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer
} from 'recharts';
import { Activity, HardDrive, Wifi, Globe, Clock, Monitor } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function Analytics() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['analytics-stats'],
        queryFn: async () => {
            // 1. Screens Status
            const { data: screens } = await supabase.from('screens').select('last_ping_at, is_active');
            const totalScreens = screens?.length || 0;
            const activeScreens = screens?.filter(s => s.is_active).length || 0;

            const now = new Date();
            const onlineScreens = screens?.filter(s => {
                if (!s.last_ping_at) return false;
                const diff = now.getTime() - new Date(s.last_ping_at).getTime();
                return diff < 5 * 60 * 1000; // 5 mins
            }).length || 0;

            // 2. Storage Usage (Approximation from media count/size if available or just count)
            const { count: mediaCount } = await supabase.from('media').select('*', { count: 'exact', head: true });

            // 3. Playlists
            const { count: playlistCount } = await supabase.from('playlists').select('*', { count: 'exact', head: true });

            // 4. Remote Commands History (Last 24h)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            // Use explicit casting for table not in generated types yet
            const { count: commandsCount } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('remote_commands' as any) as any)
                .select('*', { count: 'exact', head: true })
                .gte('created_at', yesterday.toISOString());

            return {
                totalScreens,
                activeScreens,
                onlineScreens,
                mediaCount,
                playlistCount,
                commandsCount
            };
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const data = [
        { name: 'Telas', total: stats?.totalScreens || 0, active: stats?.activeScreens || 0 },
        { name: 'Online', total: stats?.onlineScreens || 0 },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-display font-bold">Analytics</h1>
                <p className="text-muted-foreground">Métricas e performance do sistema</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Telas Online</p>
                            <h3 className="text-2xl font-bold">{stats?.onlineScreens} / {stats?.totalScreens}</h3>
                        </div>
                        <div className="p-3 bg-success/10 rounded-full">
                            <Wifi className="h-6 w-6 text-success" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Mídias</p>
                            <h3 className="text-2xl font-bold">{stats?.mediaCount}</h3>
                        </div>
                        <div className="p-3 bg-primary/10 rounded-full">
                            <HardDrive className="h-6 w-6 text-primary" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Comandos (24h)</p>
                            <h3 className="text-2xl font-bold">{stats?.commandsCount}</h3>
                        </div>
                        <div className="p-3 bg-accent/10 rounded-full">
                            <Activity className="h-6 w-6 text-accent" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Playlists</p>
                            <h3 className="text-2xl font-bold">{stats?.playlistCount}</h3>
                        </div>
                        <div className="p-3 bg-orange-500/10 rounded-full">
                            <Globe className="h-6 w-6 text-orange-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Status da Rede</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Bar dataKey="total" fill="#8884d8" name="Total" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="active" fill="#82ca9d" name="Ativas" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Placeholder for Playback Stats (if logs table existed) */}
                <Card className="glass">
                    <CardHeader>
                        <CardTitle>Atividade Recente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                            <div className="text-center">
                                <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                <p>Métricas de playback detalhadas<br />estarão disponíveis em breve.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
