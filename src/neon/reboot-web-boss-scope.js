// Escopo de leitura compartilhado por bootstrap e polling do Boss Web.
export function rebootWebBossScope(chat,weekend){
 return weekend?.open?{chat:'__alpha_global_weekly_boss__',weekendKey:weekend.weekendKey}:{chat,weekendKey:null}
}
