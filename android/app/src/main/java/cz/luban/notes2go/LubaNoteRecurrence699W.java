package cz.luban.notes2go;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** 699W: one future occurrence, computed by the Android receiver offline.
 * Mirrors recurringTasks.js's daily / weekly / monthly calendar rules.
 * Calendar (not java.time) keeps compatibility with minSdk 22. */
final class LubaNoteRecurrence699W {
  private static final int MAX_DAYS=3660;
  private static final long DAY_MS=86400000L;
  private static final TimeZone UTC=TimeZone.getTimeZone("UTC");
  private LubaNoteRecurrence699W() {}

  private static int[] date(String text) {
    if(text==null || !text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return null;
    try {
      int y=Integer.parseInt(text.substring(0,4));
      int m=Integer.parseInt(text.substring(5,7));
      int d=Integer.parseInt(text.substring(8,10));
      GregorianCalendar check=new GregorianCalendar(UTC);
      check.setLenient(false);check.clear();check.set(y,m-1,d);
      check.getTimeInMillis(); // reject impossible dates
      return new int[]{y,m,d};
    } catch(Exception ignored) {return null;}
  }
  private static long dayNumber(int y,int m,int d) {
    GregorianCalendar cal=new GregorianCalendar(UTC);
    cal.clear();cal.set(y,m-1,d);
    return cal.getTimeInMillis()/DAY_MS;
  }
  private static int weekday(int y,int m,int d) {
    GregorianCalendar cal=new GregorianCalendar(UTC);
    cal.clear();cal.set(y,m-1,d);
    return (cal.get(Calendar.DAY_OF_WEEK)+6)%7; // Sunday=0 as in JS Date
  }
  // 699X: JSON null means an unlimited recurrence, not the text "null".
  static boolean valid(JSONObject rule) {
    if(rule==null || !rule.optBoolean("enabled",false)) return false;
    String type=rule.optString("type","");
    if(!"daily".equals(type) && !"weekly".equals(type) && !"monthly".equals(type)) return false;
    if(rule.optInt("interval",1)<1 || rule.optInt("interval",1)>3660) return false;
    if(date(rule.optString("startDate",""))==null) return false;
    String end=rule.isNull("endDate") ? "" : rule.optString("endDate","");
    if(!end.isEmpty() && date(end)==null) return false;
    if("weekly".equals(type)) {
      JSONArray days=rule.optJSONArray("days");
      if(days==null || days.length()==0 || days.length()>7) return false;
      for(int i=0;i<days.length();i++) if(days.optInt(i,-1)<0 || days.optInt(i,-1)>6) return false;
    }
    return true;
  }
  private static boolean match(int y,int m,int d,JSONObject rule,int[] start,int[] end) {
    long target=dayNumber(y,m,d), beginning=dayNumber(start[0],start[1],start[2]);
    if(target<beginning || (end!=null && target>dayNumber(end[0],end[1],end[2]))) return false;
    int interval=Math.max(1,rule.optInt("interval",1));
    switch(rule.optString("type","")) {
      case "daily":return (target-beginning)%interval==0;
      case "weekly": {
        int w=weekday(y,m,d);
        JSONArray days=rule.optJSONArray("days");
        boolean chosen=false;
        for(int i=0;days!=null && i<days.length();i++) if(days.optInt(i,-1)==w) chosen=true;
        if(!chosen) return false;
        long firstMonday=beginning-(weekday(start[0],start[1],start[2])+6)%7;
        long currentMonday=target-(w+6)%7;
        return ((currentMonday-firstMonday)/7)%interval==0;
      }
      case "monthly": {
        int months=(y-start[0])*12+(m-start[1]);
        if(months<0 || months%interval!=0) return false;
        int expected=Math.max(1,rule.optInt("dayOfMonth",start[2]));
        GregorianCalendar month=new GregorianCalendar(UTC);
        month.clear();month.set(y,m-1,1);
        return d==Math.min(expected,month.getActualMaximum(Calendar.DAY_OF_MONTH));
      }
      default:return false;
    }
  }
  static long next(long baseAt,JSONObject rule,long after) {
    if(!valid(rule) || baseAt<=0 || after<=0) return 0L;
    try {
      int[] start=date(rule.optString("startDate",""));
      int[] end=date(rule.isNull("endDate") ? "" : rule.optString("endDate",""));
      Calendar base=Calendar.getInstance();base.setTimeInMillis(baseAt);
      int hour=base.get(Calendar.HOUR_OF_DAY),minute=base.get(Calendar.MINUTE);
      Calendar day=Calendar.getInstance();day.setTimeInMillis(after);
      day.set(Calendar.HOUR_OF_DAY,12);day.set(Calendar.MINUTE,0);
      day.set(Calendar.SECOND,0);day.set(Calendar.MILLISECOND,0);
      for(int i=0;i<MAX_DAYS;i++,day.add(Calendar.DATE,1)) {
        int y=day.get(Calendar.YEAR),m=day.get(Calendar.MONTH)+1,d=day.get(Calendar.DATE);
        if(!match(y,m,d,rule,start,end)) continue;
        Calendar occurrence=Calendar.getInstance();occurrence.clear();
        occurrence.set(y,m-1,d,hour,minute);
        long at=occurrence.getTimeInMillis();
        if(at>after) return at;
      }
    } catch(Exception ignored) { /* malformed rules must never kill a receiver */ }
    return 0L;
  }
}
