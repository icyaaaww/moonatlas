// Fictional material for exploring maintenance workflows; no user data.
export function maintenanceSample() {
  const baseline=[
    {path:'团队/发布流程.md',content:'# 发布流程\n## 发布前检查\n确认测试通过。\n登记发布负责人。\n## 回滚\n出现错误时，通知维护者后手动回滚。\n记录处理过程。'},
    {path:'团队/新人手册.md',content:'# 新人手册\n## 第一次发布\n请阅读[发布流程](发布流程.md)。\n参考[旧版值班表](值班表.md)。'},
    {path:'团队/值班表.md',content:'# 值班表\n此处为演示用的旧版值班安排。'},
    {path:'团队/故障记录.md',content:'# 故障记录\n## 跟进\n按[发布流程](发布流程.md)核对回滚步骤。'},
    {path:'待整理.md',content:'# 待整理的交接事项\n这份资料尚未确定主题，请在右侧整理。'},
    {path:'备份/交接事项.md',content:'# 待整理的交接事项\n这份资料尚未确定主题，请在右侧整理。'},
  ];
  const documents=baseline.filter(d=>d.path!=='团队/值班表.md').map(d=>d.path==='团队/发布流程.md'?{...d,content:d.content.replace('确认测试通过。','确认测试和备份验证通过。').replace('出现错误时，通知维护者后手动回滚。','错误率达到约定阈值时，先停止发布，再由负责人确认回滚。')}:structuredClone(d));
  return {format:'moonatlas',version:1,name:'0.3 整理与更新演示 · 虚构资料',documents,baseline,preferences:[],aliases:[],reviews:[]};
}
