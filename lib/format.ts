export const formatCurrency = (amount: number): string => {
    const finite = Number.isFinite(amount) ? amount : 0;
    // El -0 existe en JS y se formatea como "-0.00". Sale solo al negar un cero para
    // presentarlo como resta ("(-) Deducible" sobre un mes sin compras), y un "-0.00" en
    // pantalla parece un error de calculo.
    const safeAmount = Object.is(finite, -0) ? 0 : finite;
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(safeAmount);
};

/**
 * Las fechas de negocio (emision, vencimiento, proximo cobro) se guardan como medianoche
 * UTC, sin hora real. Formatearlas en la zona local las corre un dia hacia atras en
 * Republica Dominicana (UTC-4): el 2 de agosto se mostraba como el 1. Por eso se leen en
 * UTC, que es donde estan.
 */
export const formatDate = (date: Date | string): string => {
    return new Intl.DateTimeFormat('es-DO', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(date));
};
