import { useState } from "react";
import { WebPlayer, WebPlayerMedia } from "./WebPlayer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Tv } from "lucide-react";

// Mock Data for Technical Validation
const MOCK_PLAYLIST: WebPlayerMedia[] = [
    {
        id: "1",
        type: "image",
        url: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba",
        duration: 5,
        objectFit: "contain"
    },
    {
        id: "2",
        type: "video",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        duration: 10,
        objectFit: "contain"
    },
    {
        id: "3",
        type: "image",
        url: "https://images.unsplash.com/photo-1682687982185-531d09ec56fc", // Vertical image
        duration: 5,
        objectFit: "contain"
    }
];

export default function WebPlayerDemo() {
    const [aspectRatio, setAspectRatio] = useState("16/9");
    const [deviceFrame, setDeviceFrame] = useState<"tv" | "totem" | "monitor" | "none">("tv");
    const [showGuides, setShowGuides] = useState(false);
    const [muted, setMuted] = useState(true);

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
            {/* Control Panel (Dashboard Simulator) */}
            <div className="w-80 bg-gray-800 border-r border-gray-700 p-6 flex flex-col gap-6 overflow-y-auto">
                <div>
                    <h1 className="text-xl font-bold mb-2 text-primary">WebPlayer Tech Check</h1>
                    <p className="text-xs text-gray-400">
                        Ferramenta de validação técnica de renderização e aspect ratio.
                    </p>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="space-y-2">
                    <Label>Proporção da Tela (Banco de Dados)</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                        <SelectTrigger className="bg-gray-700 border-gray-600">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="16/9">16:9 (Horizontal Padrão)</SelectItem>
                            <SelectItem value="9/16">9:16 (Vertical / Totem)</SelectItem>
                            <SelectItem value="4/3">4:3 (Monitor Antigo)</SelectItem>
                            <SelectItem value="32/9">32:9 (Ultrawide)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Device Frame Selector */}
                <div className="space-y-2">
                    <Label>Simulação de Hardware</Label>
                    <div className="grid grid-cols-3 gap-2">
                        <Button
                            variant={deviceFrame === 'tv' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDeviceFrame('tv')}
                            className="flex flex-col h-20 gap-1"
                        >
                            <Tv size={20} />
                            <span className="text-[10px]">TV</span>
                        </Button>
                        <Button
                            variant={deviceFrame === 'totem' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDeviceFrame('totem')}
                            className="flex flex-col h-20 gap-1"
                        >
                            <Smartphone size={20} />
                            <span className="text-[10px]">Totem</span>
                        </Button>
                        <Button
                            variant={deviceFrame === 'monitor' ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDeviceFrame('monitor')}
                            className="flex flex-col h-20 gap-1"
                        >
                            <Monitor size={20} />
                            <span className="text-[10px]">PC</span>
                        </Button>
                    </div>
                </div>

                {/* Technical Toggles */}
                <Card className="bg-gray-700 border-gray-600">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Guias Técnicos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs">Safe Area (10%)</Label>
                            <Switch checked={showGuides} onCheckedChange={setShowGuides} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className="text-xs">Audio Muted</Label>
                            <Switch checked={muted} onCheckedChange={setMuted} />
                        </div>
                    </CardContent>
                </Card>

                <div className="mt-auto text-[10px] text-gray-500">
                    <p>Engine: HTML5 Video API</p>
                    <p>Protection: Object-Fit Strict</p>
                    <p>v1.0.0 - Technical Sandbox</p>
                </div>
            </div>

            {/* Stage Area */}
            <div className="flex-1 bg-black flex items-center justify-center relative p-8">
                {/* 
                  The generic "wall" background pattern to clarify transparency/aspect ratio limits 
                */}
                <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: 'radial-gradient(#333 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}></div>

                {/* THE PLAYER INSTANCE */}
                <WebPlayer
                    playlist={MOCK_PLAYLIST}
                    aspectRatio={aspectRatio}
                    deviceFrame={deviceFrame}
                    showGuides={showGuides}
                    muted={muted}
                    autoPlay={true}
                />
            </div>
        </div>
    );
}
