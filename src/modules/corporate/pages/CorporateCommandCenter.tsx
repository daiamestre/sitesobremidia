import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Building2, Users, FileText, Monitor, BarChart3, ArrowRight, Zap, Database } from "lucide-react";
import { Link } from "react-router-dom";

export default function CorporateCommandCenter() {
  const { usuario, user } = useAuth();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* HEADER DE BOAS VINDAS DO OWNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10 gap-1 font-mono text-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> PROPRIETÁRIO ABSOLUTO (OWNER)
            </Badge>
            <Badge variant="secondary" className="text-xs">
              SISTEMA ATIVO
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Corporate Command Center
          </h1>
          <p className="text-muted-foreground">
            Bem-vindo, <span className="text-foreground font-semibold">{usuario?.nome || user?.email}</span>. Painel central de governança e controle do ecossistema Sobre Mídia ERP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/workspace/bi">
            <Button variant="default" className="gap-2 shadow-md">
              <BarChart3 className="h-4 w-4" /> BI Executivo
            </Button>
          </Link>
          <Link to="/workspace/screens">
            <Button variant="outline" className="gap-2">
              <Monitor className="h-4 w-4" /> Digital Signage
            </Button>
          </Link>
        </div>
      </div>

      {/* CARDS DE STATUS CORPORATIVO */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Organização Root</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">SOBRE MÍDIA</div>
            <p className="text-xs text-muted-foreground mt-1">Tenant Soberano Ativo</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status do Banco (RLS)</CardTitle>
            <Zap className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">Zero Trust</div>
            <p className="text-xs text-muted-foreground mt-1">Multi-Tenant Isolado</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Storage de Mídia</CardTitle>
            <Database className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-500">Cloudflare R2</div>
            <p className="text-xs text-muted-foreground mt-1">100% Migrado e Integrado</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sessão Atual</CardTitle>
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-500">OWNER / ADMIN</div>
            <p className="text-xs text-muted-foreground mt-1">Acesso Irrestrito Liberado</p>
          </CardContent>
        </Card>
      </div>

      {/* MÓDULOS RÁPIDOS DE GOVERNANÇA E GESTÃO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <Card className="border-border/60 hover:border-primary/40 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" /> Módulo Comercial & CRM
            </CardTitle>
            <CardDescription>
              Gestão de representantes, clientes, propostas comerciais e pedidos de inserção.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/workspace/clientes" className="block text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>Clientes & Parceiros</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/propostas" className="block text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>Propostas Comerciais</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/contratos" className="block text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-between py-1">
              <span>Gestão de Contratos</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/60 hover:border-primary/40 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-emerald-500" /> Módulo Financeiro & BI
            </CardTitle>
            <CardDescription>
              Demonstrativo de resultado (DRE), controle de receita, livro razão e conciliação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/workspace/financeiro" className="block text-sm text-muted-foreground hover:text-emerald-500 transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>Dashboard Financeiro</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/financeiro/dre" className="block text-sm text-muted-foreground hover:text-emerald-500 transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>DRE & Resultado</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/bi" className="block text-sm text-muted-foreground hover:text-emerald-500 transition-colors flex items-center justify-between py-1">
              <span>Analytics Executivo</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/60 hover:border-primary/40 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Monitor className="h-5 w-5 text-sky-500" /> Módulo Operacional & Telas
            </CardTitle>
            <CardDescription>
              Controle da rede de exibição de mídias, agendamento de inventário e players.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/workspace/operations" className="block text-sm text-muted-foreground hover:text-sky-500 transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>NOC & Operações</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/screens" className="block text-sm text-muted-foreground hover:text-sky-500 transition-colors flex items-center justify-between py-1 border-b border-border/30">
              <span>Gestão de Telas & Players</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/workspace/media" className="block text-sm text-muted-foreground hover:text-sky-500 transition-colors flex items-center justify-between py-1">
              <span>Biblioteca de Mídias (R2)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
