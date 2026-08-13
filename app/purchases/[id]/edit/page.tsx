import Link from "next/link";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { QuickPurchaseForm } from "@/components/purchases/QuickPurchaseForm";
import { getContacts, getPurchase, getProjects } from "@/app/actions";
import { safeReturnTo } from "@/lib/return-to";
import { notFound } from "next/navigation";

interface EditPurchasePageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EditPurchasePage({ params, searchParams }: EditPurchasePageProps) {
    const { id } = await params;
    const purchaseId = parseInt(id);

    if (isNaN(purchaseId)) {
        notFound();
    }

    const [purchase, contacts, projects, query] = await Promise.all([
        getPurchase(purchaseId),
        getContacts({ type: 'SUPPLIER' as any }),
        getProjects(),
        searchParams,
    ]);

    if (!purchase) {
        notFound();
    }

    // Las compras personales se editan en el formulario rapido, que es mas corto. Pero ese
    // no deja cambiar el tipo, asi que `?full=1` permite volver al formulario completo y
    // devolverlas a formal: sin esta salida, marcar una compra como personal no tendria
    // vuelta atras.
    const useFullForm = purchase.type === "FORMAL" || query.full === "1";

    // Se llego aqui desde otra pantalla (el detalle de un proyecto, por ejemplo): al
    // guardar hay que devolver el usuario ahi y no al listado de compras.
    const successRedirect = safeReturnTo(query.returnTo);
    const fullFormHref = successRedirect
        ? `/purchases/${purchaseId}/edit?full=1&returnTo=${encodeURIComponent(successRedirect)}`
        : `/purchases/${purchaseId}/edit?full=1`;

    return (
        <div className="animate-in fade-in duration-500">
            {useFullForm ? (
                <PurchaseForm contacts={contacts} projects={projects} initialData={purchase} successRedirect={successRedirect} />
            ) : (
                <>
                    <QuickPurchaseForm projects={projects} initialData={purchase} successRedirect={successRedirect} />
                    <div className="mx-auto mt-4 max-w-3xl text-center">
                        <Link
                            href={fullFormHref}
                            className="text-sm font-bold text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                        >
                            Editar en el formulario completo
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}
