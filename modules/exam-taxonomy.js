(function () {
  // 广东省考行测 90 题 / 90 分钟；国考行测 135 题 / 120 分钟
  const XINGCE = {
    政治理论: {
      guangdong: "10 题",
      guokao: "20 题",
      subtypes: ["党史党建", "习近平新时代中国特色社会主义思想", "时政热点", "综合练习"]
    },
    常识判断: {
      guangdong: "5 题",
      guokao: "15 题",
      subtypes: ["法律", "经济", "科技", "人文历史", "地理", "综合练习"]
    },
    言语理解: {
      guangdong: "15 题",
      guokao: "30 题",
      subtypes: ["逻辑填空", "片段阅读-主旨", "片段阅读-细节", "语句表达", "综合练习"]
    },
    数量关系: {
      guangdong: "10 题",
      guokao: "15 题",
      subtypes: [
        "数字推理-基础数列",
        "数字推理-递推数列",
        "数学运算-工程问题",
        "数学运算-行程问题",
        "数学运算-排列组合",
        "数学运算-概率问题",
        "数学运算-几何问题",
        "数学运算-不定方程",
        "综合练习"
      ]
    },
    图形推理: {
      guangdong: "5 题",
      guokao: "约 10 题",
      subtypes: ["位置规律", "样式规律", "数量规律", "空间类/多立体", "综合练习"]
    },
    逻辑推理: {
      guangdong: "15 题",
      guokao: "约 15 题",
      subtypes: ["翻译推理", "真假推理", "论证结构", "日常结论", "排列组合单题", "综合练习"]
    },
    科学推理: {
      guangdong: "5 题",
      guokao: "无",
      subtypes: ["物理", "化学", "生物", "综合练习"]
    },
    资料分析: {
      guangdong: "20 题",
      guokao: "20 题",
      subtypes: ["增长率", "增长量", "比重", "平均数", "倍数", "综合分析", "综合练习"]
    },
    套卷: {
      guangdong: "90 题卷",
      guokao: "135 题卷",
      subtypes: ["广东省考真题", "国考真题", "模考卷", "专项套卷", "纸质卷", "其他"]
    }
  };

  const SHENLUN = {
    概括题: {
      guangdong: "归纳概括",
      guokao: "归纳概括",
      subtypes: ["概括主要问题", "概括主要原因", "概括主要做法", "综合概括", "综合练习"]
    },
    综合分析: {
      guangdong: "分析评论",
      guokao: "分析评论",
      subtypes: ["评论型", "解释型", "启示型", "比较型", "综合练习"]
    },
    提出对策: {
      guangdong: "对策建议",
      guokao: "对策建议",
      subtypes: ["针对问题提对策", "概括问题+提对策", "综合练习"]
    },
    贯彻执行: {
      guangdong: "应用文",
      guokao: "应用文",
      subtypes: ["宣传类", "方案类", "讲话稿", "倡议/书信", "综合练习"]
    },
    大作文: {
      guangdong: "乡镇卷不考",
      guokao: "议论文",
      subtypes: ["议论文", "策论文", "综合练习"]
    },
    套卷: {
      guangdong: "4 类试卷",
      guokao: "5 类试卷",
      subtypes: ["县级卷", "乡镇卷", "公安卷", "公安加考", "模考卷", "其他"]
    }
  };

  function getCategories(subject) {
    const map = subject === "申论" ? SHENLUN : XINGCE;
    return Object.keys(map);
  }

  function getSubtypeMeta(subject, category) {
    const map = subject === "申论" ? SHENLUN : XINGCE;
    return map[category] || null;
  }

  function formatExamHint(subject, category) {
    const meta = getSubtypeMeta(subject, category);
    if (!meta) return "";
    const parts = [];
    if (meta.guangdong) parts.push(`广东省考 ${meta.guangdong}`);
    if (meta.guokao) parts.push(`国考 ${meta.guokao}`);
    return parts.join(" · ");
  }

  function formatQuestionType(category, subtype) {
    if (!category) return "";
    if (!subtype || subtype === "综合练习") return category;
    return `${category} · ${subtype}`;
  }

  const EXTRA_MATERIAL_TAGS = [
    { value: "实习技术", label: "实习技术" },
    { value: "实习项目", label: "实习项目" },
    { value: "面试素材", label: "面试素材" },
    { value: "其他", label: "其他" }
  ];

  function getMaterialTagGroups() {
    return [
      {
        group: "行测",
        options: Object.keys(XINGCE).map((category) => ({
          value: `行测-${category}`,
          label: `行测-${category}`
        }))
      },
      {
        group: "申论",
        options: Object.keys(SHENLUN).map((category) => ({
          value: `申论-${category}`,
          label: `申论-${category}`
        }))
      },
      {
        group: "实习",
        options: EXTRA_MATERIAL_TAGS.filter((item) => item.value !== "其他")
      },
      {
        group: "其他",
        options: [{ value: "其他", label: "其他" }]
      }
    ];
  }

  function getAllMaterialTags() {
    return getMaterialTagGroups().flatMap((group) => group.options.map((opt) => opt.value));
  }

  function normalizeMaterialTag(tag) {
    if (!tag) return "其他";
    if (getAllMaterialTags().includes(tag)) return tag;
    const legacy = { 行测: "行测-套卷", 申论: "申论-套卷", 常识: "行测-常识判断" };
    return legacy[tag] || tag;
  }

  window.PlannerExamTaxonomy = {
    XINGCE,
    SHENLUN,
    getCategories,
    getSubtypeMeta,
    formatExamHint,
    formatQuestionType,
    getMaterialTagGroups,
    getAllMaterialTags,
    normalizeMaterialTag
  };
})();
