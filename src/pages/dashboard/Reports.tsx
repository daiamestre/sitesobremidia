import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScreens } from "@/hooks/useScreens";
import { useAuth } from "@/contexts/AuthContext";
import {
    FileText,
    Download,
    FileDown,
    Monitor,
    Calendar,
    Loader2,
    ChevronRight,
    Database
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface AuditFile {
    name: string;
    id: string;
    created_at: string;
    size: number;
}

export default function Reports() {
    const { user } = useAuth();
    const { screens, loading: loadingScreens } = useScreens(user?.id);
    const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
    const [files, setFiles] = useState<AuditFile[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);

    // Fetch files when a screen is selected
    useEffect(() => {
        if (selectedScreen) {
            fetchFiles(selectedScreen);
        }
    }, [selectedScreen]);

    const fetchFiles = async (screenId: string) => {
        setLoadingFiles(true);
        try {
            // Assuming storage bucket 'audit_logs' and folder structure: screenId/filename.csv
            const { data, error } = await supabase.storage
                .from("audit_logs")
                .list(screenId, {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: "name", order: "desc" },
                });

            if (error) throw error;

            setFiles(data.map(f => ({
                name: f.name,
                id: f.id,
                created_at: f.created_at,
                size: f.metadata?.size || 0
            })));
        } catch (error) {
            console.error("Error fetching audit logs:", error);
            toast.error("Erro ao carregar logs de auditoria");
        } finally {
            setLoadingFiles(false);
        }
    };

    const downloadCSV = async (screenId: string, fileName: string) => {
        try {
            const { data, error } = await supabase.storage
                .from("audit_logs")
                .download(`${screenId}/${fileName}`);

            if (error) throw error;

            const url = URL.createObjectURL(data);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error("Erro ao baixar CSV");
        }
    };

    const exportPDF = async (screenId: string, fileName: string) => {
        try {
            // 1. Download CSV content
            const { data, error } = await supabase.storage
                .from("audit_logs")
                .download(`${screenId}/${fileName}`);

            if (error) throw error;

            const text = await data.text();
            const lines = text.split("\n");
            const header = lines[0].split(";");
            const body = lines.slice(1).map(line => line.split(";")).filter(row => row.length > 1);

            // 2. Generate PDF
            const doc = new jsPDF();

            // Header decorativo
            doc.setFillColor(30, 41, 59);
            doc.rect(0, 0, 210, 40, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.text("Relatório de Auditoria", 15, 20);
            doc.setFontSize(10);
            doc.text(`Player: ${screens.find(s => s.id === screenId)?.name || screenId}`, 15, 30);
            doc.text(`Arquivo: ${fileName}`, 15, 35);

            autoTable(doc, {
                head: [header],
                body: body,
                startY: 50,
                theme: "striped",
                headStyles: { fillColor: [30, 41, 59] },
                styles: { fontSize: 8 },
            });

            doc.save(fileName.replace(".csv", ".pdf"));
            toast.success("PDF gerado com sucesso!");
        } catch (error) {
            console.error(error);
            toast.error("Erro ao gerar PDF");
        }
    };

    if (loadingScreens) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-3xl font-display font-bold">Relatórios de Auditoria</h1>
                <p className="text-muted-foreground">Proof of Play e relatórios de exibição por dispositivo.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Screens List */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Monitor className="h-5 w-5" />
                        Dispositivos
                    </h2>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                        {screens.map((screen) => (
                            <Card
                                key={screen.id}
                                className={`cursor-pointer border transition-all ${selectedScreen === screen.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                                onClick={() => setSelectedScreen(screen.id)}
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="font-medium">{screen.name}</span>
                                        <span className="text-xs text-muted-foreground uppercase">{screen.location || "Sem local"}</span>
                                    </div>
                                    <ChevronRight className={`h-4 w-4 transition-transform ${selectedScreen === screen.id ? 'translate-x-1 text-primary' : ''}`} />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* Reports Content */}
                <div className="md:col-span-2 space-y-4">
                    {!selectedScreen ? (
                        <Card className="h-full flex flex-col items-center justify-center p-12 text-center border-dashed border-2">
                            <Database className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <CardTitle className="text-xl text-muted-foreground">Selecione um Player</CardTitle>
                            <CardDescription>Selecione um dispositivo à esquerda para visualizar seus logs de auditoria.</CardDescription>
                        </Card>
                    ) : (
                        <Card className="min-h-[400px]">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle>Logs de {screens.find(s => s.id === selectedScreen)?.name}</CardTitle>
                                        <CardDescription>Arquivos CSV enviados pelo dispositivo Android.</CardDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-primary/5">
                                        {files.length} Arquivos
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loadingFiles ? (
                                    <div className="flex items-center justify-center h-32">
                                        <Loader2 className="animate-spin h-6 w-6 text-primary" />
                                    </div>
                                ) : files.length === 0 ? (
                                    <div className="text-center py-12">
                                        <Calendar className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                                        <p className="text-muted-foreground italic">Nenhum log encontrado para este dispositivo.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {files.map((file) => (
                                            <div key={file.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-md bg-muted group-hover:bg-primary/10 transition-colors">
                                                        <FileText className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{file.name}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {new Date(file.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-2"
                                                        onClick={() => downloadCSV(selectedScreen, file.name)}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                        CSV
                                                    </Button>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="gap-2 gradient-primary"
                                                        onClick={() => exportPDF(selectedScreen, file.name)}
                                                    >
                                                        <FileDown className="h-4 w-4" />
                                                        PDF Professional
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
