import type { LanguageCode } from '../utils/language'

export type TranslationKey =
  // Settings modal
  | 'settings.title'
  | 'settings.tabs.general'
  | 'settings.tabs.language'
  | 'settings.tabs.sound'
  | 'settings.tabs.video'
  | 'settings.general.showBettingStatistics'
  | 'settings.sound.label'
  | 'settings.live.label'
  | 'settings.video.label'
  | 'settings.video.lineLabel'
  // Session expired
  | 'sessionExpired.title'
  | 'sessionExpired.message'
  | 'sessionExpired.goHome'
  // Betting / Game history modal
  | 'history.modal.title.bet'
  | 'history.modal.title.game'
  | 'history.tabs.bet'
  | 'history.tabs.game'
  | 'history.filter.date'
  | 'history.filter.allArenas'
  | 'history.bet.loading'
  | 'history.bet.empty'
  | 'history.bet.columns.betId'
  | 'history.bet.columns.arena'
  | 'history.bet.columns.betOption'
  | 'history.bet.columns.bet'
  | 'history.bet.columns.winLose'
  | 'history.bet.columns.betTime'
  | 'history.bet.pending'
  | 'history.bet.win'
  | 'history.bet.drawReturned'
  | 'history.bet.lose'
  | 'history.game.loading'
  | 'history.game.empty'
  | 'history.game.columns.index'
  | 'history.game.columns.match'
  | 'history.game.columns.roundNo'
  | 'history.game.columns.openDate'
  | 'history.game.columns.winner'
  // Main bet labels
  | 'bet.label.meron'
  | 'bet.label.wala'
  | 'bet.label.draw'
  // Game summary / Rooms
  | 'gameSummary.title'
  | 'gameSummary.status.label'
  | 'gameSummary.status.betting'
  | 'gameSummary.status.fighting'
  | 'gameSummary.status.waiting'
  | 'gameSummary.status.settled'
  | 'gameSummary.status.maintenance'
  // Game history
  | 'gameHistory.arena'
  | 'gameHistory.history'
  // Bet success
  | 'bet.success.message'
  // Win/Lose messages
  | 'bet.result.youWon'
  | 'bet.result.youLost'
  | 'bet.result.drawReturned'
  | 'bet.result.meronWin'
  | 'bet.result.walaWin'
  | 'bet.result.draw'
  // Error messages
  | 'error.noPreviousBets'
  | 'error.bettingClosed'
  | 'error.bettingClosedInProgress'
  | 'error.roundSettled'
  | 'error.roundNotOpen'
  | 'error.bettingNotAvailable'
  | 'error.minimumBetAmount'
  | 'error.maximumBetAmount'
  | 'error.betTypeMaximumBetAmount'
  | 'error.betTypeMinimumBetAmount'
  | 'error.tableIdMissing'
  | 'error.roundIdMissing'
  | 'error.gameTableNotOpen'
  | 'error.sessionExpired'
  | 'error.insufficientBalance'
  | 'error.oddsChanged'
  | 'error.amountOutsideRange'
  | 'error.backendMinimumRequirement'

type TranslationsByLang = Record<LanguageCode, Partial<Record<TranslationKey, string>>>

const translations: TranslationsByLang = {
  'en-us': {
    // Settings
    'settings.title': 'Settings',
    'settings.tabs.general': 'General',
    'settings.tabs.language': 'Language',
    'settings.tabs.sound': 'Sound',
    'settings.tabs.video': 'Video',
    'settings.general.showBettingStatistics': 'SHOW BETTING STATISTICS',
    'settings.sound.label': 'Sound',
    'settings.live.label': 'Live',
    'settings.video.label': 'Video',
    'settings.video.lineLabel': 'Line',
    // Session expired
    'sessionExpired.title': 'Session expired',
    'sessionExpired.message': 'Your session has expired. Please go back to the lobby and try again.',
    'sessionExpired.goHome': 'Go to Lobby',
    // Betting / Game history
    'history.modal.title.bet': 'Betting History',
    'history.modal.title.game': 'Game History',
    'history.tabs.bet': 'Bet History',
    'history.tabs.game': 'Game History',
    'history.filter.date': 'Date',
    'history.filter.allArenas': 'All Arenas',
    'history.bet.loading': 'Loading betting history...',
    'history.bet.empty': 'No betting records found for this date.',
    'history.bet.columns.betId': 'BetID',
    'history.bet.columns.arena': 'Arena',
    'history.bet.columns.betOption': 'Bet Option',
    'history.bet.columns.bet': 'Bet',
    'history.bet.columns.winLose': 'Win/Lose',
    'history.bet.columns.betTime': 'Bet Time',
    'history.bet.pending': 'Pending',
    'history.bet.win': 'Win',
    'history.bet.drawReturned': 'Draw - Bet Returned',
    'history.bet.lose': 'Lose',
    'history.game.loading': 'Loading match history...',
    'history.game.empty': 'No match records found for this date and arena.',
    'history.game.columns.index': '#',
    'history.game.columns.match': 'Match',
    'history.game.columns.roundNo': 'Round No',
    'history.game.columns.openDate': 'Open Date',
    'history.game.columns.winner': 'Winner',
    'bet.label.meron': 'Meron',
    'bet.label.wala': 'Wala',
    'bet.label.draw': 'Draw',
    // Game summary
    'gameSummary.title': 'Rooms',
    'gameSummary.status.label': 'Status',
    'gameSummary.status.betting': 'Betting',
    'gameSummary.status.fighting': 'Fighting',
    'gameSummary.status.waiting': 'Waiting',
    'gameSummary.status.settled': 'Settled',
    'gameSummary.status.maintenance': 'Maintenance',
    // Game history
    'gameHistory.arena': 'Arena',
    'gameHistory.history': 'History',
    // Bet success
    'bet.success.message': 'Bet Success',
    // Win/Lose messages
    'bet.result.youWon': 'You Won!',
    'bet.result.youLost': 'You Lost',
    'bet.result.drawReturned': 'Draw - Bet Returned',
    'bet.result.meronWin': 'MERON WIN',
    'bet.result.walaWin': 'WALA WIN',
    'bet.result.draw': 'DRAW',
    // Error messages
    'error.noPreviousBets': 'No previous bets to rebet.',
    'error.bettingClosed': 'Betting is closed. Please wait for the next betting period.',
    'error.bettingClosedInProgress': 'Betting is closed. The round is in progress.',
    'error.roundSettled': 'This round has been settled. Please wait for the next round.',
    'error.roundNotOpen': 'Round/session is not open for betting. Please wait for the next betting period.',
    'error.bettingNotAvailable': 'Betting is not available. Please wait for the next betting period.',
    'error.minimumBetAmount': 'Minimum bet amount is {amount}.',
    'error.maximumBetAmount': 'Maximum bet amount is {amount}.',
    'error.betTypeMaximumBetAmount': '{betType}: Maximum bet amount is {amount}.',
    'error.betTypeMinimumBetAmount': '{betType}: Minimum bet amount is {amount}.',
    'error.tableIdMissing': 'Table ID is missing. Please refresh the page.',
    'error.roundIdMissing': 'Round ID is missing. Please wait for round data to load or refresh the page.',
    'error.gameTableNotOpen': 'Game/table is not open for betting.',
    'error.sessionExpired': 'Session expired. Please refresh the page.',
    'error.insufficientBalance': 'Insufficient balance.',
    'error.oddsChanged': 'Odds have changed. The bet was retried automatically but still failed. Please try again.',
    'error.amountOutsideRange': 'Amount outside bet-limit range. Minimum bet amount is {amount}.',
    'error.backendMinimumRequirement': 'Backend requires each bet to be at least {min}. Your total bets ({total}) already meet the minimum, but individual bets below {min} are not allowed by the backend.',
  },
  // Traditional Chinese
  'zh-tw': {
    'settings.title': '設定',
    'settings.tabs.general': '一般',
    'settings.tabs.language': '語言',
    'settings.tabs.sound': '聲音',
    'settings.tabs.video': '視訊',
    'settings.general.showBettingStatistics': '顯示投注統計',
    'settings.sound.label': '聲音',
    'settings.live.label': '直播',
    'settings.video.label': '視訊',
    'settings.video.lineLabel': '線路',
    'sessionExpired.title': '連線逾時',
    'sessionExpired.message': '您的登入連線已逾時，請回到大廳重新進入遊戲。',
    'sessionExpired.goHome': '回到大廳',
    'history.modal.title.bet': '投注記錄',
    'history.modal.title.game': '對戰記錄',
    'history.tabs.bet': '投注記錄',
    'history.tabs.game': '遊戲記錄',
    'history.filter.date': '日期',
    'history.filter.allArenas': '全部場次',
    'history.bet.loading': '載入投注記錄中...',
    'history.bet.empty': '此日期沒有投注記錄。',
    'history.bet.columns.betId': '注單號',
    'history.bet.columns.arena': '場次',
    'history.bet.columns.betOption': '投注項目',
    'history.bet.columns.bet': '投注額',
    'history.bet.columns.winLose': '輸贏',
    'history.bet.columns.betTime': '投注時間',
    'history.bet.pending': '待結算',
    'history.bet.win': '贏',
    'history.bet.drawReturned': '和局 - 退回本金',
    'history.bet.lose': '輸',
    'history.game.loading': '載入對戰記錄中...',
    'history.game.empty': '此日期與場次沒有對戰記錄。',
    'history.game.columns.index': '序',
    'history.game.columns.match': '場次',
    'history.game.columns.roundNo': '局號',
    'history.game.columns.openDate': '開賽時間',
    'history.game.columns.winner': '結果',
    'bet.label.meron': '龍',
    'bet.label.wala': '虎',
    'bet.label.draw': '和局',
    // Game summary
    'gameSummary.title': '房間',
    'gameSummary.status.label': '狀態',
    'gameSummary.status.betting': '投注中',
    'gameSummary.status.fighting': '對戰中',
    'gameSummary.status.waiting': '等待中',
    'gameSummary.status.settled': '已結算',
    'gameSummary.status.maintenance': '維護中',
    // Game history
    'gameHistory.arena': '場次',
    'gameHistory.history': '歷史',
    // Bet success
    'bet.success.message': '投注成功',
    // Win/Lose messages
    'bet.result.youWon': '您贏了！',
    'bet.result.youLost': '您輸了',
    'bet.result.drawReturned': '和局 - 退回本金',
    'bet.result.meronWin': '龍勝',
    'bet.result.walaWin': '虎勝',
    'bet.result.draw': '和局',
    // Error messages
    'error.noPreviousBets': '沒有先前的投注可以重新投注。',
    'error.bettingClosed': '投注已關閉。請等待下一個投注時段。',
    'error.bettingClosedInProgress': '投注已關閉。本局正在進行中。',
    'error.roundSettled': '本局已結算。請等待下一局。',
    'error.roundNotOpen': '本局/連線未開放投注。請等待下一個投注時段。',
    'error.bettingNotAvailable': '投注不可用。請等待下一個投注時段。',
    'error.minimumBetAmount': '最低投注金額為 {amount}。',
    'error.maximumBetAmount': '最高投注金額為 {amount}。',
    'error.betTypeMaximumBetAmount': '{betType}：最高投注金額為 {amount}。',
    'error.betTypeMinimumBetAmount': '{betType}：最低投注金額為 {amount}。',
    'error.tableIdMissing': '缺少桌號。請重新整理頁面。',
    'error.roundIdMissing': '缺少局號。請等待局號資料載入或重新整理頁面。',
    'error.gameTableNotOpen': '遊戲/桌台未開放投注。',
    'error.sessionExpired': '連線已過期。請重新整理頁面。',
    'error.insufficientBalance': '餘額不足。',
    'error.oddsChanged': '賠率已變更。系統已自動重試但仍失敗。請再試一次。',
    'error.amountOutsideRange': '金額超出投注限額範圍。最低投注金額為 {amount}。',
    'error.backendMinimumRequirement': '後端要求每筆投注至少 {min}。您的總投注額 ({total}) 已達到最低要求，但後端不允許低於 {min} 的個別投注。',
  },
  'zh-cn': {
    'settings.title': '设置',
    'settings.tabs.general': '通用',
    'settings.tabs.language': '语言',
    'settings.tabs.sound': '声音',
    'settings.tabs.video': '视频',
    'settings.general.showBettingStatistics': '显示投注统计',
    'settings.sound.label': '声音',
    'settings.live.label': '直播',
    'settings.video.label': '视频',
    'settings.video.lineLabel': '线路',
    'sessionExpired.title': '连接超时',
    'sessionExpired.message': '您的登录已过期，请返回大厅重新进入游戏。',
    'sessionExpired.goHome': '返回大厅',
    'history.modal.title.bet': '投注记录',
    'history.modal.title.game': '对局记录',
    'history.tabs.bet': '投注记录',
    'history.tabs.game': '游戏记录',
    'history.filter.date': '日期',
    'history.filter.allArenas': '全部场次',
    'history.bet.loading': '正在加载投注记录...',
    'history.bet.empty': '该日期没有投注记录。',
    'history.bet.columns.betId': '注单号',
    'history.bet.columns.arena': '场次',
    'history.bet.columns.betOption': '投注项目',
    'history.bet.columns.bet': '投注额',
    'history.bet.columns.winLose': '输赢',
    'history.bet.columns.betTime': '投注时间',
    'history.bet.pending': '待结算',
    'history.bet.win': '赢',
    'history.bet.drawReturned': '和局 - 退回本金',
    'history.bet.lose': '输',
    'history.game.loading': '正在加载对局记录...',
    'history.game.empty': '该日期及场次没有对局记录。',
    'history.game.columns.index': '序',
    'history.game.columns.match': '场次',
    'history.game.columns.roundNo': '局号',
    'history.game.columns.openDate': '开赛时间',
    'history.game.columns.winner': '结果',
    'bet.label.meron': '龙',
    'bet.label.wala': '虎',
    'bet.label.draw': '和局',
    // Game summary
    'gameSummary.title': '房间',
    'gameSummary.status.label': '状态',
    'gameSummary.status.betting': '投注中',
    'gameSummary.status.fighting': '对战中',
    'gameSummary.status.waiting': '等待中',
    'gameSummary.status.settled': '已结算',
    'gameSummary.status.maintenance': '维护中',
    // Game history
    'gameHistory.arena': '场次',
    // Bet success
    'bet.success.message': '投注成功',
    // Win/Lose messages
    'bet.result.youWon': '您赢了！',
    'bet.result.youLost': '您输了',
    'bet.result.drawReturned': '和局 - 退回本金',
    'bet.result.meronWin': '龙胜',
    'bet.result.walaWin': '虎胜',
    'bet.result.draw': '和局',
    // Error messages
    'error.noPreviousBets': '没有先前的投注可以重新投注。',
    'error.bettingClosed': '投注已关闭。请等待下一个投注时段。',
    'error.bettingClosedInProgress': '投注已关闭。本局正在进行中。',
    'error.roundSettled': '本局已结算。请等待下一局。',
    'error.roundNotOpen': '本局/连线未开放投注。请等待下一个投注时段。',
    'error.bettingNotAvailable': '投注不可用。请等待下一个投注时段。',
    'error.minimumBetAmount': '最低投注金额为 {amount}。',
    'error.maximumBetAmount': '最高投注金额为 {amount}。',
    'error.betTypeMaximumBetAmount': '{betType}：最高投注金额为 {amount}。',
    'error.betTypeMinimumBetAmount': '{betType}：最低投注金额为 {amount}。',
    'error.tableIdMissing': '缺少桌号。请刷新页面。',
    'error.roundIdMissing': '缺少局号。请等待局号数据加载或刷新页面。',
    'error.gameTableNotOpen': '游戏/桌台未开放投注。',
    'error.sessionExpired': '连接已过期。请刷新页面。',
    'error.insufficientBalance': '余额不足。',
    'error.oddsChanged': '赔率已变更。系统已自动重试但仍失败。请再试一次。',
    'error.amountOutsideRange': '金额超出投注限额范围。最低投注金额为 {amount}。',
    'error.backendMinimumRequirement': '后端要求每笔投注至少 {min}。您的总投注额 ({total}) 已达到最低要求，但后端不允许低于 {min} 的个别投注。',
  },
  'vi-vn': {
    'settings.title': 'Cài đặt',
    'settings.tabs.general': 'Chung',
    'settings.tabs.language': 'Ngôn ngữ',
    'settings.tabs.sound': 'Âm thanh',
    'settings.tabs.video': 'Video',
    'settings.general.showBettingStatistics': 'HIỂN THỊ THỐNG KÊ CƯỢC',
    'settings.sound.label': 'Âm thanh',
    'settings.live.label': 'Trực tiếp',
    'settings.video.label': 'Video',
    'settings.video.lineLabel': 'Đường truyền',
    'sessionExpired.title': 'Phiên làm việc hết hạn',
    'sessionExpired.message': 'Phiên đăng nhập của bạn đã hết hạn. Vui lòng quay lại sảnh và vào lại trò chơi.',
    'sessionExpired.goHome': 'Về sảnh',
    'history.modal.title.bet': 'Lịch sử cược',
    'history.modal.title.game': 'Lịch sử trận đấu',
    'history.tabs.bet': 'Lịch sử cược',
    'history.tabs.game': 'Lịch sử trận đấu',
    'history.filter.date': 'Ngày',
    'history.filter.allArenas': 'Tất cả sàn đấu',
    'history.bet.loading': 'Đang tải lịch sử cược...',
    'history.bet.empty': 'Không có lịch sử cược cho ngày này.',
    'history.bet.columns.betId': 'Mã cược',
    'history.bet.columns.arena': 'Sàn đấu',
    'history.bet.columns.betOption': 'Cửa cược',
    'history.bet.columns.bet': 'Tiền cược',
    'history.bet.columns.winLose': 'Thắng/Thua',
    'history.bet.columns.betTime': 'Thời gian cược',
    'history.bet.pending': 'Đang chờ',
    'history.bet.win': 'Thắng',
    'history.bet.drawReturned': 'Hòa - Hoàn tiền',
    'history.bet.lose': 'Thua',
    'history.game.loading': 'Đang tải lịch sử trận đấu...',
    'history.game.empty': 'Không có trận đấu nào cho ngày và sàn đấu này.',
    'history.game.columns.index': '#',
    'history.game.columns.match': 'Sàn đấu',
    'history.game.columns.roundNo': 'Ván số',
    'history.game.columns.openDate': 'Giờ mở cược',
    'history.game.columns.winner': 'Kết quả',
    'bet.label.meron': 'Meron',
    'bet.label.wala': 'Wala',
    'bet.label.draw': 'Hòa',
    // Game summary
    'gameSummary.title': 'Phòng',
    'gameSummary.status.label': 'Trạng thái',
    'gameSummary.status.betting': 'Đang cược',
    'gameSummary.status.fighting': 'Đang thi đấu',
    'gameSummary.status.waiting': 'Đang chờ',
    'gameSummary.status.settled': 'Đã kết thúc',
    'gameSummary.status.maintenance': 'Bảo trì',
    // Game history
    'gameHistory.arena': 'Sàn đấu',
    'gameHistory.history': 'Lịch sử',
    // Bet success
    'bet.success.message': 'Đặt cược thành công',
    // Win/Lose messages
    'bet.result.youWon': 'Bạn đã thắng！',
    'bet.result.youLost': 'Bạn đã thua',
    'bet.result.drawReturned': 'Hòa - Hoàn tiền',
    'bet.result.meronWin': 'MERON THẮNG',
    'bet.result.walaWin': 'WALA THẮNG',
    'bet.result.draw': 'HÒA',
    // Error messages
    'error.noPreviousBets': 'Không có cược trước đó để đặt lại.',
    'error.bettingClosed': 'Cược đã đóng. Vui lòng đợi phiên cược tiếp theo.',
    'error.bettingClosedInProgress': 'Cược đã đóng. Ván đang diễn ra.',
    'error.roundSettled': 'Ván này đã kết thúc. Vui lòng đợi ván tiếp theo.',
    'error.roundNotOpen': 'Ván/phiên chưa mở cược. Vui lòng đợi phiên cược tiếp theo.',
    'error.bettingNotAvailable': 'Cược không khả dụng. Vui lòng đợi phiên cược tiếp theo.',
    'error.minimumBetAmount': 'Số tiền cược tối thiểu là {amount}.',
    'error.maximumBetAmount': 'Số tiền cược tối đa là {amount}.',
    'error.betTypeMaximumBetAmount': '{betType}: Số tiền cược tối đa là {amount}.',
    'error.betTypeMinimumBetAmount': '{betType}: Số tiền cược tối thiểu là {amount}.',
    'error.tableIdMissing': 'Thiếu ID bàn. Vui lòng làm mới trang.',
    'error.roundIdMissing': 'Thiếu ID ván. Vui lòng đợi dữ liệu ván tải hoặc làm mới trang.',
    'error.gameTableNotOpen': 'Trò chơi/bàn chưa mở cược.',
    'error.sessionExpired': 'Phiên đã hết hạn. Vui lòng làm mới trang.',
    'error.insufficientBalance': 'Số dư không đủ.',
    'error.oddsChanged': 'Tỷ lệ đã thay đổi. Hệ thống đã tự động thử lại nhưng vẫn thất bại. Vui lòng thử lại.',
    'error.amountOutsideRange': 'Số tiền ngoài phạm vi giới hạn cược. Số tiền cược tối thiểu là {amount}.',
    'error.backendMinimumRequirement': 'Hệ thống yêu cầu mỗi cược tối thiểu {min}. Tổng cược của bạn ({total}) đã đạt mức tối thiểu, nhưng hệ thống không cho phép các cược riêng lẻ dưới {min}.',
  },
  'ja-jp': {
    'settings.title': '設定',
    'settings.tabs.general': '一般',
    'settings.tabs.language': '言語',
    'settings.tabs.sound': 'サウンド',
    'settings.tabs.video': 'ビデオ',
    'settings.general.showBettingStatistics': 'ベッティング統計を表示',
    'settings.sound.label': 'サウンド',
    'settings.live.label': 'ライブ',
    'settings.video.label': 'ビデオ',
    'settings.video.lineLabel': 'ライン',
    'sessionExpired.title': 'セッション切れ',
    'sessionExpired.message': 'ログインセッションが切れました。ロビーに戻って再度ゲームに入ってください。',
    'sessionExpired.goHome': 'ロビーへ戻る',
    'history.modal.title.bet': 'ベット履歴',
    'history.modal.title.game': 'ゲーム履歴',
    'history.tabs.bet': 'ベット履歴',
    'history.tabs.game': 'ゲーム履歴',
    'history.filter.date': '日付',
    'history.filter.allArenas': 'すべてのテーブル',
    'history.bet.loading': 'ベット履歴を読み込み中...',
    'history.bet.empty': 'この日付のベット履歴はありません。',
    'history.bet.columns.betId': 'ベットID',
    'history.bet.columns.arena': 'テーブル',
    'history.bet.columns.betOption': 'ベット項目',
    'history.bet.columns.bet': 'ベット額',
    'history.bet.columns.winLose': '勝敗',
    'history.bet.columns.betTime': 'ベット時間',
    'history.bet.pending': '未決済',
    'history.bet.win': '勝ち',
    'history.bet.drawReturned': '引き分け - 払い戻し',
    'history.bet.lose': '負け',
    'history.game.loading': 'ゲーム履歴を読み込み中...',
    'history.game.empty': 'この日付とテーブルにはゲーム履歴がありません。',
    'history.game.columns.index': '番号',
    'history.game.columns.match': 'テーブル',
    'history.game.columns.roundNo': 'ラウンド',
    'history.game.columns.openDate': '開始時間',
    'history.game.columns.winner': '結果',
    'bet.label.meron': 'メロン',
    'bet.label.wala': 'ワラ',
    'bet.label.draw': '引き分け',
    // Game summary
    'gameSummary.title': 'ルーム',
    'gameSummary.status.label': 'ステータス',
    'gameSummary.status.betting': 'ベッティング中',
    'gameSummary.status.fighting': '対戦中',
    'gameSummary.status.waiting': '待機中',
    'gameSummary.status.settled': '決済済み',
    'gameSummary.status.maintenance': 'メンテナンス中',
    // Game history
    'gameHistory.arena': 'アリーナ',
    'gameHistory.history': '履歴',
    // Bet success
    'bet.success.message': 'ベット成功',
    // Win/Lose messages
    'bet.result.youWon': 'あなたの勝ち！',
    'bet.result.youLost': 'あなたの負け',
    'bet.result.drawReturned': '引き分け - 払い戻し',
    'bet.result.meronWin': 'メロン勝利',
    'bet.result.walaWin': 'ワラ勝利',
    'bet.result.draw': '引き分け',
    // Error messages
    'error.noPreviousBets': '再ベットする以前のベットがありません。',
    'error.bettingClosed': 'ベッティングは終了しました。次のベッティング期間をお待ちください。',
    'error.bettingClosedInProgress': 'ベッティングは終了しました。ラウンドが進行中です。',
    'error.roundSettled': 'このラウンドは決済済みです。次のラウンドをお待ちください。',
    'error.roundNotOpen': 'ラウンド/セッションはベッティングに開放されていません。次のベッティング期間をお待ちください。',
    'error.bettingNotAvailable': 'ベッティングは利用できません。次のベッティング期間をお待ちください。',
    'error.minimumBetAmount': '最低ベット額は {amount} です。',
    'error.maximumBetAmount': '最高ベット額は {amount} です。',
    'error.betTypeMaximumBetAmount': '{betType}：最高ベット額は {amount} です。',
    'error.betTypeMinimumBetAmount': '{betType}：最低ベット額は {amount} です。',
    'error.tableIdMissing': 'テーブルIDがありません。ページを更新してください。',
    'error.roundIdMissing': 'ラウンドIDがありません。ラウンドデータの読み込みを待つか、ページを更新してください。',
    'error.gameTableNotOpen': 'ゲーム/テーブルはベッティングに開放されていません。',
    'error.sessionExpired': 'セッションが期限切れです。ページを更新してください。',
    'error.insufficientBalance': '残高が不足しています。',
    'error.oddsChanged': 'オッズが変更されました。自動的に再試行しましたが、まだ失敗しました。もう一度お試しください。',
    'error.amountOutsideRange': '金額がベット制限範囲外です。最低ベット額は {amount} です。',
    'error.backendMinimumRequirement': 'バックエンドは各ベットを最低 {min} にする必要があります。総ベット額 ({total}) はすでに最低額を満たしていますが、バックエンドは {min} 未満の個別ベットを許可していません。',
  },
  'ko-kr': {
    'settings.title': '설정',
    'settings.tabs.general': '일반',
    'settings.tabs.language': '언어',
    'settings.tabs.sound': '사운드',
    'settings.tabs.video': '비디오',
    'settings.general.showBettingStatistics': '베팅 통계 표시',
    'settings.sound.label': '사운드',
    'settings.live.label': '라이브',
    'settings.video.label': '비디오',
    'settings.video.lineLabel': '라인',
    'sessionExpired.title': '세션 만료',
    'sessionExpired.message': '로그인 세션이 만료되었습니다. 로비로 돌아가 다시 게임에 입장해 주세요.',
    'sessionExpired.goHome': '로비로 가기',
    'history.modal.title.bet': '베팅 기록',
    'history.modal.title.game': '게임 기록',
    'history.tabs.bet': '베팅 기록',
    'history.tabs.game': '게임 기록',
    'history.filter.date': '날짜',
    'history.filter.allArenas': '전체 테이블',
    'history.bet.loading': '베팅 기록을 불러오는 중...',
    'history.bet.empty': '해당 날짜의 베팅 기록이 없습니다.',
    'history.bet.columns.betId': '베팅 ID',
    'history.bet.columns.arena': '테이블',
    'history.bet.columns.betOption': '베팅 항목',
    'history.bet.columns.bet': '베팅 금액',
    'history.bet.columns.winLose': '승/패',
    'history.bet.columns.betTime': '베팅 시간',
    'history.bet.pending': '대기중',
    'history.bet.win': '승',
    'history.bet.drawReturned': '무승부 - 원금 반환',
    'history.bet.lose': '패',
    'history.game.loading': '게임 기록을 불러오는 중...',
    'history.game.empty': '해당 날짜와 테이블의 게임 기록이 없습니다.',
    'history.game.columns.index': '번호',
    'history.game.columns.match': '테이블',
    'history.game.columns.roundNo': '라운드',
    'history.game.columns.openDate': '시작 시간',
    'history.game.columns.winner': '결과',
    'bet.label.meron': '메론',
    'bet.label.wala': '왈라',
    'bet.label.draw': '무승부',
    // Game summary
    'gameSummary.title': '룸',
    'gameSummary.status.label': '상태',
    'gameSummary.status.betting': '베팅 중',
    'gameSummary.status.fighting': '대전 중',
    'gameSummary.status.waiting': '대기 중',
    'gameSummary.status.settled': '정산 완료',
    'gameSummary.status.maintenance': '점검 중',
    // Game history
    'gameHistory.arena': '아레나',
    'gameHistory.history': '기록',
    // Bet success
    'bet.success.message': '베팅 성공',
    // Win/Lose messages
    'bet.result.youWon': '승리하셨습니다！',
    'bet.result.youLost': '패배하셨습니다',
    'bet.result.drawReturned': '무승부 - 원금 반환',
    'bet.result.meronWin': '메론 승',
    'bet.result.walaWin': '왈라 승',
    'bet.result.draw': '무승부',
    // Error messages
    'error.noPreviousBets': '재베팅할 이전 베팅이 없습니다.',
    'error.bettingClosed': '베팅이 종료되었습니다. 다음 베팅 시간을 기다려 주세요.',
    'error.bettingClosedInProgress': '베팅이 종료되었습니다. 라운드가 진행 중입니다.',
    'error.roundSettled': '이 라운드는 정산되었습니다. 다음 라운드를 기다려 주세요.',
    'error.roundNotOpen': '라운드/세션이 베팅에 열려 있지 않습니다. 다음 베팅 시간을 기다려 주세요.',
    'error.bettingNotAvailable': '베팅을 사용할 수 없습니다. 다음 베팅 시간을 기다려 주세요.',
    'error.minimumBetAmount': '최소 베팅 금액은 {amount}입니다.',
    'error.maximumBetAmount': '최대 베팅 금액은 {amount}입니다.',
    'error.betTypeMaximumBetAmount': '{betType}: 최대 베팅 금액은 {amount}입니다.',
    'error.betTypeMinimumBetAmount': '{betType}: 최소 베팅 금액은 {amount}입니다.',
    'error.tableIdMissing': '테이블 ID가 없습니다. 페이지를 새로고침하세요.',
    'error.roundIdMissing': '라운드 ID가 없습니다. 라운드 데이터가 로드될 때까지 기다리거나 페이지를 새로고침하세요.',
    'error.gameTableNotOpen': '게임/테이블이 베팅에 열려 있지 않습니다.',
    'error.sessionExpired': '세션이 만료되었습니다. 페이지를 새로고침하세요.',
    'error.insufficientBalance': '잔액이 부족합니다.',
    'error.oddsChanged': '배당률이 변경되었습니다. 자동으로 재시도했지만 여전히 실패했습니다. 다시 시도해 주세요.',
    'error.amountOutsideRange': '금액이 베팅 한도 범위를 벗어났습니다. 최소 베팅 금액은 {amount}입니다.',
    'error.backendMinimumRequirement': '백엔드는 각 베팅을 최소 {min}으로 요구합니다. 총 베팅 금액 ({total})은 이미 최소 요구 사항을 충족하지만, 백엔드는 {min} 미만의 개별 베팅을 허용하지 않습니다.',
  },
  'th-th': {
    'settings.title': 'การตั้งค่า',
    'settings.tabs.general': 'ทั่วไป',
    'settings.tabs.language': 'ภาษา',
    'settings.tabs.sound': 'เสียง',
    'settings.tabs.video': 'วิดีโอ',
    'settings.general.showBettingStatistics': 'แสดงสถิติการเดิมพัน',
    'settings.sound.label': 'เสียง',
    'settings.live.label': 'ถ่ายทอดสด',
    'settings.video.label': 'วิดีโอ',
    'settings.video.lineLabel': 'สายสัญญาณ',
    'sessionExpired.title': 'เซสชันหมดเวลา',
    'sessionExpired.message': 'เซสชันการเข้าสู่ระบบของคุณหมดเวลาแล้ว กรุณากลับไปที่ล็อบบี้และเข้าเกมใหม่อีกครั้ง',
    'sessionExpired.goHome': 'กลับไปล็อบบี้',
    'history.modal.title.bet': 'ประวัติการเดิมพัน',
    'history.modal.title.game': 'ประวัติเกม',
    'history.tabs.bet': 'ประวัติเดิมพัน',
    'history.tabs.game': 'ประวัติเกม',
    'history.filter.date': 'วันที่',
    'history.filter.allArenas': 'ทุกโต๊ะ',
    'history.bet.loading': 'กำลังโหลดประวัติการเดิมพัน...',
    'history.bet.empty': 'ไม่พบบันทึกการเดิมพันในวันดังกล่าว',
    'history.bet.columns.betId': 'รหัสเดิมพัน',
    'history.bet.columns.arena': 'โต๊ะ',
    'history.bet.columns.betOption': 'ตัวเลือกเดิมพัน',
    'history.bet.columns.bet': 'ยอดเดิมพัน',
    'history.bet.columns.winLose': 'ได้/เสีย',
    'history.bet.columns.betTime': 'เวลาเดิมพัน',
    'history.bet.pending': 'รอผล',
    'history.bet.win': 'ชนะ',
    'history.bet.drawReturned': 'เสมอ - คืนเงิน',
    'history.bet.lose': 'แพ้',
    'history.game.loading': 'กำลังโหลดประวัติเกม...',
    'history.game.empty': 'ไม่พบบันทึกเกมสำหรับวันและโต๊ะนี้',
    'history.game.columns.index': 'ลำดับ',
    'history.game.columns.match': 'โต๊ะ',
    'history.game.columns.roundNo': 'รอบ',
    'history.game.columns.openDate': 'เวลาเริ่ม',
    'history.game.columns.winner': 'ผลลัพธ์',
    'bet.label.meron': 'เมรอน',
    'bet.label.wala': 'วาลา',
    'bet.label.draw': 'เสมอ',
    // Game summary
    'gameSummary.title': 'ห้อง',
    'gameSummary.status.label': 'สถานะ',
    'gameSummary.status.betting': 'กำลังเดิมพัน',
    'gameSummary.status.fighting': 'กำลังต่อสู้',
    'gameSummary.status.waiting': 'รอ',
    'gameSummary.status.settled': 'ตัดสินแล้ว',
    'gameSummary.status.maintenance': 'ดูแลรักษา',
    // Game history
    'gameHistory.arena': 'เวที',
    'gameHistory.history': 'ประวัติ',
    // Bet success
    'bet.success.message': 'เดิมพันสำเร็จ',
    // Win/Lose messages
    'bet.result.youWon': 'คุณชนะ！',
    'bet.result.youLost': 'คุณแพ้',
    'bet.result.drawReturned': 'เสมอ - คืนเงิน',
    'bet.result.meronWin': 'เมรอนชนะ',
    'bet.result.walaWin': 'วาลาชนะ',
    'bet.result.draw': 'เสมอ',
    // Error messages
    'error.noPreviousBets': 'ไม่มีเดิมพันก่อนหน้านี้ที่จะเดิมพันซ้ำ',
    'error.bettingClosed': 'การเดิมพันปิดแล้ว กรุณารอช่วงเวลาการเดิมพันถัดไป',
    'error.bettingClosedInProgress': 'การเดิมพันปิดแล้ว รอบกำลังดำเนินอยู่',
    'error.roundSettled': 'รอบนี้ตัดสินแล้ว กรุณารอรอบถัดไป',
    'error.roundNotOpen': 'รอบ/เซสชันยังไม่เปิดให้เดิมพัน กรุณารอช่วงเวลาการเดิมพันถัดไป',
    'error.bettingNotAvailable': 'การเดิมพันไม่พร้อมใช้งาน กรุณารอช่วงเวลาการเดิมพันถัดไป',
    'error.minimumBetAmount': 'จำนวนเดิมพันขั้นต่ำคือ {amount}',
    'error.maximumBetAmount': 'จำนวนเดิมพันสูงสุดคือ {amount}',
    'error.betTypeMaximumBetAmount': '{betType}: จำนวนเดิมพันสูงสุดคือ {amount}',
    'error.betTypeMinimumBetAmount': '{betType}: จำนวนเดิมพันขั้นต่ำคือ {amount}',
    'error.tableIdMissing': 'ไม่มี ID โต๊ะ กรุณารีเฟรชหน้า',
    'error.roundIdMissing': 'ไม่มี ID รอบ กรุณารอให้ข้อมูลรอบโหลดหรือรีเฟรชหน้า',
    'error.gameTableNotOpen': 'เกม/โต๊ะยังไม่เปิดให้เดิมพัน',
    'error.sessionExpired': 'เซสชันหมดอายุ กรุณารีเฟรชหน้า',
    'error.insufficientBalance': 'ยอดเงินไม่เพียงพอ',
    'error.oddsChanged': 'อัตราต่อรองเปลี่ยนแล้ว ระบบได้ลองใหม่อัตโนมัติแต่ยังล้มเหลว กรุณาลองอีกครั้ง',
    'error.amountOutsideRange': 'จำนวนเงินอยู่นอกช่วงจำกัดการเดิมพัน จำนวนเดิมพันขั้นต่ำคือ {amount}',
    'error.backendMinimumRequirement': 'ระบบต้องการให้แต่ละเดิมพันอย่างน้อย {min} ยอดเดิมพันรวมของคุณ ({total}) ถึงขั้นต่ำแล้ว แต่ระบบไม่อนุญาตให้เดิมพันแยกต่ำกว่า {min}',
  },
  'id-id': {
    'settings.title': 'Pengaturan',
    'settings.tabs.general': 'Umum',
    'settings.tabs.language': 'Bahasa',
    'settings.tabs.sound': 'Suara',
    'settings.tabs.video': 'Video',
    'settings.general.showBettingStatistics': 'TAMPILKAN STATISTIK TARUHAN',
    'settings.sound.label': 'Suara',
    'settings.live.label': 'Live',
    'settings.video.label': 'Video',
    'settings.video.lineLabel': 'Jalur',
    'sessionExpired.title': 'Sesi berakhir',
    'sessionExpired.message': 'Sesi login Anda telah berakhir. Silakan kembali ke lobi dan masuk ke permainan lagi.',
    'sessionExpired.goHome': 'Kembali ke Lobi',
    'history.modal.title.bet': 'Riwayat Taruhan',
    'history.modal.title.game': 'Riwayat Permainan',
    'history.tabs.bet': 'Riwayat Taruhan',
    'history.tabs.game': 'Riwayat Permainan',
    'history.filter.date': 'Tanggal',
    'history.filter.allArenas': 'Semua Meja',
    'history.bet.loading': 'Memuat riwayat taruhan...',
    'history.bet.empty': 'Tidak ada riwayat taruhan pada tanggal ini.',
    'history.bet.columns.betId': 'ID Taruhan',
    'history.bet.columns.arena': 'Meja',
    'history.bet.columns.betOption': 'Pilihan Taruhan',
    'history.bet.columns.bet': 'Taruhan',
    'history.bet.columns.winLose': 'Menang/Kalah',
    'history.bet.columns.betTime': 'Waktu Taruhan',
    'history.bet.pending': 'Menunggu',
    'history.bet.win': 'Menang',
    'history.bet.drawReturned': 'Seri - Taruhan Dikembalikan',
    'history.bet.lose': 'Kalah',
    'history.game.loading': 'Memuat riwayat permainan...',
    'history.game.empty': 'Tidak ada riwayat permainan untuk tanggal dan meja ini.',
    'history.game.columns.index': '#',
    'history.game.columns.match': 'Meja',
    'history.game.columns.roundNo': 'Putaran',
    'history.game.columns.openDate': 'Waktu Mulai',
    'history.game.columns.winner': 'Pemenang',
    'bet.label.meron': 'Meron',
    'bet.label.wala': 'Wala',
    'bet.label.draw': 'Seri',
    // Game summary
    'gameSummary.title': 'Ruang',
    'gameSummary.status.label': 'Status',
    'gameSummary.status.betting': 'Bertaruh',
    'gameSummary.status.fighting': 'Bertarung',
    'gameSummary.status.waiting': 'Menunggu',
    'gameSummary.status.settled': 'Selesai',
    'gameSummary.status.maintenance': 'Pemeliharaan',
    // Game history
    'gameHistory.arena': 'Arena',
    'gameHistory.history': 'Riwayat',
    // Bet success
    'bet.success.message': 'Taruhan Berhasil',
    // Win/Lose messages
    'bet.result.youWon': 'Anda Menang！',
    'bet.result.youLost': 'Anda Kalah',
    'bet.result.drawReturned': 'Seri - Taruhan Dikembalikan',
    'bet.result.meronWin': 'MERON MENANG',
    'bet.result.walaWin': 'WALA MENANG',
    'bet.result.draw': 'SERI',
    // Error messages
    'error.noPreviousBets': 'Tidak ada taruhan sebelumnya untuk di-taruh ulang.',
    'error.bettingClosed': 'Taruhan ditutup. Silakan tunggu periode taruhan berikutnya.',
    'error.bettingClosedInProgress': 'Taruhan ditutup. Putaran sedang berlangsung.',
    'error.roundSettled': 'Putaran ini telah diselesaikan. Silakan tunggu putaran berikutnya.',
    'error.roundNotOpen': 'Putaran/sesi tidak terbuka untuk taruhan. Silakan tunggu periode taruhan berikutnya.',
    'error.bettingNotAvailable': 'Taruhan tidak tersedia. Silakan tunggu periode taruhan berikutnya.',
    'error.minimumBetAmount': 'Jumlah taruhan minimum adalah {amount}.',
    'error.maximumBetAmount': 'Jumlah taruhan maksimum adalah {amount}.',
    'error.betTypeMaximumBetAmount': '{betType}: Jumlah taruhan maksimum adalah {amount}.',
    'error.betTypeMinimumBetAmount': '{betType}: Jumlah taruhan minimum adalah {amount}.',
    'error.tableIdMissing': 'ID Meja hilang. Silakan refresh halaman.',
    'error.roundIdMissing': 'ID Putaran hilang. Silakan tunggu data putaran dimuat atau refresh halaman.',
    'error.gameTableNotOpen': 'Permainan/meja tidak terbuka untuk taruhan.',
    'error.sessionExpired': 'Sesi berakhir. Silakan refresh halaman.',
    'error.insufficientBalance': 'Saldo tidak mencukupi.',
    'error.oddsChanged': 'Odds telah berubah. Taruhan telah dicoba ulang secara otomatis tetapi masih gagal. Silakan coba lagi.',
    'error.amountOutsideRange': 'Jumlah di luar rentang batas taruhan. Jumlah taruhan minimum adalah {amount}.',
    'error.backendMinimumRequirement': 'Backend memerlukan setiap taruhan minimal {min}. Total taruhan Anda ({total}) sudah memenuhi minimum, tetapi backend tidak mengizinkan taruhan individual di bawah {min}.',
  },
}

export const translate = (key: TranslationKey, language: LanguageCode): string => {
  const langTable = translations[language] || translations['en-us']
  return langTable[key] || translations['en-us'][key] || key
}


