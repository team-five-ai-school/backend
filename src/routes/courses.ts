import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { CourseDto, getCourse, getLesson, LessonDto, listCourses, StepDto, toCourseDto, toLessonDto, toSteps } from "../content/courses.ts";
import { error, ErrorBody } from "../lib/http.ts";

/**
 * Public course content. User-independent, so the frontend can cache it ("use cache" + tag).
 * Per-user progress comes from GET /me/progress (routes/progress.ts).
 */
export const coursesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/courses",
    { schema: { tags: ["courses"], response: { 200: z.array(CourseDto) } } },
    async () => listCourses().map(toCourseDto),
  );

  app.get(
    "/courses/:courseId",
    {
      schema: {
        tags: ["courses"],
        params: z.object({ courseId: z.string() }),
        response: { 200: z.object({ course: CourseDto, lessons: z.array(LessonDto) }), 404: ErrorBody },
      },
    },
    async (req, reply) => {
      const course = getCourse(req.params.courseId);
      if (!course) return reply.code(404).send(error("Course not found"));
      return { course: toCourseDto(course), lessons: course.lessons.map((l, i) => toLessonDto(course, l, i + 1)) };
    },
  );

  app.get(
    "/lessons/:lessonId",
    {
      schema: {
        tags: ["courses"],
        params: z.object({ lessonId: z.string() }),
        response: {
          200: z.object({
            lesson: LessonDto,
            courseId: z.string(),
            courseTitle: z.string(),
            nextLessonId: z.string().nullable(),
            steps: z.array(StepDto),
          }),
          404: ErrorBody,
        },
      },
    },
    async (req, reply) => {
      const found = getLesson(req.params.lessonId);
      if (!found) return reply.code(404).send(error("Lesson not found"));
      const { course, lesson, order, nextLessonId } = found;
      return {
        lesson: toLessonDto(course, lesson, order),
        courseId: course.id,
        courseTitle: course.title,
        nextLessonId,
        steps: toSteps(lesson),
      };
    },
  );
};
