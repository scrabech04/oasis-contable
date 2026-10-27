/**
 * Direcciones de los servicios de la DGII por ambiente (Descripcion Tecnica Servicios DGII,
 * actualizacion 02-01-2026).
 *
 *   TesteCF  pre-certificacion: pruebas libres, la DGII guarda los envios 60 dias.
 *   CerteCF  certificacion: el set de pruebas oficial.
 *   eCF      produccion: todo lo que se envia tiene validez fiscal.
 */
import type { EcfEnvironment } from "./types";

const SEGMENT: Record<EcfEnvironment, string> = { TesteCF: "testecf", CerteCF: "certecf", eCF: "ecf" };

export function environmentSegment(env: EcfEnvironment) {
  return SEGMENT[env];
}

export function dgiiEndpoints(env: EcfEnvironment) {
  const seg = SEGMENT[env];
  const ecf = `https://ecf.dgii.gov.do/${seg}`;
  const fc = `https://fc.dgii.gov.do/${seg}`;
  return {
    seed: `${ecf}/autenticacion/api/autenticacion/semilla`,
    validateSeed: `${ecf}/autenticacion/api/autenticacion/validarsemilla`,
    reception: `${ecf}/recepcion/api/facturaselectronicas`,
    summaryReception: `${fc}/recepcionfc/api/recepcion/ecf`,
    result: `${ecf}/consultaresultado/api/consultas/estado`,
    status: `${ecf}/consultaestado/api/consultas/estado`,
    trackIds: `${ecf}/consultatrackids/api/trackids/consulta`,
    summaryQuery: `${fc}/consultarfce/api/Consultas/Consulta`,
    commercialApproval: `${ecf}/aprobacioncomercial/api/aprobacioncomercial`,
    annulment: `${ecf}/anulacionrangos/api/operaciones/anularrango`,
    directory: `${ecf}/consultadirectorio/api/consultas/obtenerdirectorioporrnc`,
    timbre: `${ecf}/ConsultaTimbre`,
    timbreFc: `${fc}/ConsultaTimbreFC`,
  };
}
