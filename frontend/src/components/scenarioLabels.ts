import type { ScenarioRead } from '../types/contracts'

const scenarioNames: Record<string, string> = {
  '台湾设施联调情景': '同预算配置探索',
  '答辩演示情景': '高风险优先配置',
}

export function displayScenarioName(name: string) {
  return toSimplifiedChinese(scenarioNames[name] ?? name)
}

export function displayScenario(scenario: ScenarioRead) {
  return { ...scenario, name: displayScenarioName(scenario.name) }
}

const traditionalToSimplified: Record<string, string> = {
  '縣': '县', '臺': '台', '蓮': '莲', '東': '东', '屏': '屏', '義': '义', '雲': '云', '蘭': '兰',
  '華': '华', '濟': '济', '灣': '湾', '門': '门', '慶': '庆', '龍': '龙', '豐': '丰', '與': '与',
  '鄉': '乡', '鎮': '镇', '區': '区', '島': '岛', '陽': '阳', '頭': '头', '蘇': '苏',
}

export function toSimplifiedChinese(value: string) {
  return [...value].map((character) => traditionalToSimplified[character] ?? character).join('')
}
