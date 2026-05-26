import Link from "next/link";
import { getQuotations } from "@/app/actions";
import { QuotationsTable } from "@/components/quotations/QuotationsTable";
import { primaryActionClass } from "@/lib/ui-styles";
import { ListPeriodFilter } from "@/components/ListPeriodFilter";
import { getPeriodParams } from "@/lib/list-period";

export default async function QuotationsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const searchParams = await props.searchParams;
    const period = getPeriodParams(searchParams);
    const quotations = await getQuotations(period);

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Cotizaciones</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Gestiona tus propuestas comerciales y conviértelas en facturas.</p>
                </div>
                <Link href="/quotations/new" className={primaryActionClass}>
                    <span className="material-icons-round text-lg">add_circle</span>
                    Nueva Cotización
                </Link>
            </header>

            <ListPeriodFilter basePath="/quotations" searchParams={searchParams} total={quotations.length} itemSingular="cotizacion registrada" itemPlural="cotizaciones registradas" />

            <QuotationsTable quotations={quotations} />
        </div>
    );
}
