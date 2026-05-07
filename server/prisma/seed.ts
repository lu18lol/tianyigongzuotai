import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('===== 初始化种子数据 =====\n');

  // ─── 皮肤护理提示 (skin_tips) ──────────────────────────────────────────────
  console.log('创建皮肤护理提示...');

  const tips = [
    {
      condition_type: 'sensitive',
      title: '敏感肌客户注意事项',
      content: '敏感肌客户皮肤屏障功能较弱，回访时应重点关注使用后的皮肤感受，询问是否有刺痛、泛红、脱屑等刺激反应。推荐产品时优先选择成分温和、不含酒精和香精的修复类产品。操作后需加强保湿和防晒指导。',
      priority: 1,
    },
    {
      condition_type: 'pregnant',
      title: '孕期/哺乳期客户注意事项',
      content: '孕期和哺乳期客户需特别关注产品安全性。避免推荐含有维A酸类（Retinoids）、水杨酸（高浓度）、对苯二酚（Hydroquinone）等成分的产品。优先推荐基础保湿、防晒和温和清洁类产品。操作前需明确告知禁用成分，操作后需留意是否有异常反应。',
      priority: 1,
    },
    {
      condition_type: 'hypertension',
      title: '高血压客户注意事项',
      content: '高血压客户在进行医美操作前需确认血压控制情况。部分医美设备操作可能影响血压，需提前评估。避免使用可能导致血管收缩的强效成分产品。建议在血压稳定期（服药后血压正常）进行非紧急类操作。',
      priority: 2,
    },
    {
      condition_type: 'diabetes',
      title: '糖尿病客户注意事项',
      content: '糖尿病客户皮肤愈合能力可能较差，操作后恢复期可能延长。需特别关注创口护理，避免感染风险。操作前确认血糖控制在正常范围。操作后需加强跟踪回访，如有愈合不良迹象及时建议就医。推荐使用促进皮肤修复的产品。',
      priority: 2,
    },
    {
      condition_type: 'allergy_prone',
      title: '过敏体质客户注意事项',
      content: '过敏体质客户在推荐新产品前应建议做皮肤测试（耳后或手臂内侧）。记录客户的过敏成分清单，下单前核对产品成分表。首次使用新产品后需在24-48小时内加强回访，确认无过敏反应。建议客户保留产品包装以便出现问题时查阅成分。',
      priority: 2,
    },
    {
      condition_type: 'dry',
      title: '干性肌肤护理提示',
      content: '干性肌肤客户需重点关注操作后的保湿护理。推荐含有透明质酸（Hyaluronic Acid）、神经酰胺（Ceramides）、甘油（Glycerin）等成分的保湿产品。操作后建议使用修复面膜加强补水。冬季需加强保湿频率，注意避免过度清洁导致皮肤屏障进一步受损。',
      priority: 3,
    },
    {
      condition_type: 'oily',
      title: '油性肌肤护理提示',
      content: '油性肌肤客户需关注操作后的控油和毛孔管理。推荐含水杨酸（低浓度）、烟酰胺（Niacinamide）等成分的产品。注意区分"油性缺水"和"油性多水"两种情况——前者需补水为主，后者需控油为主。操作后需指导客户正确的清洁频率，避免过度清洁刺激皮脂分泌。',
      priority: 3,
    },
    {
      condition_type: 'combination',
      title: '混合性肌肤护理提示',
      content: '混合性肌肤客户T区与面颊护理需要差异化处理。T区参照油性肌肤护理方案，面颊参照干性/中性肌肤方案。推荐分区护理产品，或选择适合全脸使用的温和平衡型产品。操作后回访时需分别了解不同区域的恢复情况。',
      priority: 3,
    },
    {
      condition_type: 'first_time',
      title: '首次医美客户沟通指南',
      content: '首次接触医美的客户需要更多心理建设和专业引导。了解客户的主要皮肤困扰和期望值，帮助TA建立合理的预期。操作前需详细说明过程、可能的不适感和恢复周期。操作后前3天是关键期，需保持密切回访，帮助客户度过可能的"恢复焦虑期"。首次客户的成功体验是复购和转介绍的基础。',
      priority: 2,
    },
    {
      condition_type: 'repurchase',
      title: '复购客户回访要点',
      content: '复购客户已建立基本信任，回访时可更深入地了解长期改善效果。主动提供升级方案和组合优惠。根据前次购买的反馈调整推荐方向。复购客户是转介绍的重要来源，可适当介绍转介绍奖励机制。记录客户的偏好产品类型和消费习惯，建立长期服务档案。',
      priority: 3,
    },
    {
      condition_type: 'high_budget',
      title: '高预算客户服务要点',
      content: '高预算客户对服务体验和产品品质有更高要求。推荐高价值组合方案和长期疗程计划。关注产品包装、服务环境等体验细节。主动提供VIP专属服务（如优先预约、专属顾问）。定期分享行业最新技术和产品信息，满足客户对品质生活的追求。',
      priority: 4,
    },
    {
      condition_type: 'low_budget',
      title: '低预算客户服务要点',
      content: '低预算客户更关注性价比。优先推荐基础护理和高性价比的入门产品。介绍分期付款或会员优惠方案。不要因预算低而降低服务质量——这类客户可能通过转介绍带来更多客户。关注客户的改善效果，用实际效果建立信任，为未来升级消费做铺垫。',
      priority: 4,
    },
    {
      condition_type: 'lactating',
      title: '哺乳期客户注意事项',
      content: '哺乳期客户需严格把关产品成分安全性，避免任何可能经皮吸收影响母乳的成分。禁用维A酸类、高浓度水杨酸、精油类等成分。优先推荐纯保湿、物理防晒类产品。操作前需确认客户是否在哺乳期，部分医美项目需推迟至哺乳期结束后。',
      priority: 1,
    },
    {
      condition_type: 'specific_allergy',
      title: '特定成分过敏客户注意事项',
      content: '客户存在特定成分过敏史，操作和推荐产品前必须核对产品成分表。在客户档案中清晰记录过敏成分清单，每次下单前由操作人员二次确认。建议为客户建立"安全产品清单"，只推荐已验证无过敏反应的产品。如客户出现过敏反应，立即停止使用并记录反应详情。',
      priority: 1,
    },
  ];

  for (const tip of tips) {
    await prisma.skinTip.create({ data: tip });
  }
  console.log(`  创建了 ${tips.length} 条皮肤护理提示`);

  // ─── 产品知识库模板 (product_knowledge) ─────────────────────────────────────
  // 产品知识库在实际产品导入后通过管理端创建。
  // 此处创建几条通用模板，展示数据结构。
  console.log('\n创建产品知识库模板...');

  // 查找是否有产品
  const productCount = await prisma.product.count();
  if (productCount === 0) {
    console.log('  暂无产品数据，跳过产品知识库种子数据（产品导入后再通过管理端录入）');
  } else {
    const products = await prisma.product.findMany({ take: 5 });

    for (const p of products) {
      await prisma.productKnowledge.create({
        data: {
          product_id: p.id,
          ingredients: '待录入（请根据产品说明书填写完整成分表）',
          applicable_skin_types: ['normal', 'combination'],
          contraindications: '待录入（请根据产品说明书填写禁忌情况）',
          usage_notes: '建议在专业人员指导下使用。操作后24小时内避免使用其他功能性产品。',
          care_tips: '操作后加强保湿和防晒，避免高温环境和剧烈运动。',
        },
      });
    }
    console.log(`  创建了 ${products.length} 条产品知识模板`);
  }

  // ─── 创建默认管理员（如果没有用户） ──────────────────────────────────────────
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    console.log('\n创建默认管理员...');
    await prisma.user.create({
      data: {
        name: '系统管理员',
        phone: '13800000000',
        lark_open_id: null,
        role: 'boss',
        status: 'active',
      },
    });
    console.log('  创建了默认管理员用户');
  }

  console.log('\n===== 种子数据完成 =====');
}

main()
  .catch((e) => {
    console.error('种子数据失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
