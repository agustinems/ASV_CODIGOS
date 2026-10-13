#pragma once

#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

struct ControlPacket {
  uint32_t sequence;
  bool armed;
  int throttle;
  int steering;
  int probe;
  int motorLeft;
  int motorRight;
};

inline ControlPacket neutralControl() {
  return {0, false, 0, 0, 0, 2048, 2048};
}

inline bool parseControlPacket(const char *text, ControlPacket &result) {
  if (text == nullptr || strncmp(text, "ASV1,", 5) != 0) return false;

  const char *cursor = text + 5;
  if (*cursor < '0' || *cursor > '9') return false;

  char *end = nullptr;
  errno = 0;
  const unsigned long sequence = strtoul(cursor, &end, 10);
  if (errno == ERANGE || sequence > UINT32_MAX || *end != ',') return false;
  cursor = end + 1;

  long fields[6];
  for (int index = 0; index < 6; ++index) {
    if ((*cursor < '0' || *cursor > '9') && *cursor != '-') return false;
    errno = 0;
    fields[index] = strtol(cursor, &end, 10);
    if (errno == ERANGE || end == cursor ||
        *end != (index == 5 ? '\0' : ',')) return false;
    cursor = end + 1;
  }

  if ((fields[0] != 0 && fields[0] != 1) ||
      fields[1] < -100 || fields[1] > 100 ||
      fields[2] < -100 || fields[2] > 100 ||
      fields[3] < -100 || fields[3] > 100 ||
      fields[4] < 0 || fields[4] > 4095 ||
      fields[5] < 0 || fields[5] > 4095) return false;

  if (fields[0] == 0 &&
      (fields[1] != 0 || fields[2] != 0 || fields[3] != 0 ||
       fields[4] != 2048 || fields[5] != 2048)) return false;

  result = {
      static_cast<uint32_t>(sequence), fields[0] == 1,
      static_cast<int>(fields[1]), static_cast<int>(fields[2]),
      static_cast<int>(fields[3]), static_cast<int>(fields[4]),
      static_cast<int>(fields[5])};
  return true;
}
